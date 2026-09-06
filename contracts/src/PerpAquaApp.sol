// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AquaApp } from "@1inch/aqua/src/AquaApp.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IPriceOracle } from "./MockPriceOracle.sol";

/// @title PerpAquaApp
/// @notice JIT-sourced RFQ Perpetual Futures DEX built on 1inch Aqua & SwapVM
/// @dev Counter-margin is just-in-time sourced from maker wallets holding Aave aTokens via Aqua.
contract PerpAquaApp is AquaApp {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    // --- STRUCTS ---

    /// @notice Strategy parameters shipped by LPs to Aqua
    struct Strategy {
        address lp;
        address collateralToken; // e.g. aUSDC
        uint256 maxNotional;
        uint256 maxLeverage;     // e.g. 10 = 10x
        uint256 spreadBps;       // e.g. 10 = 10 bps (0.10%)
        uint8 sideMask;          // bit 0: can take long (1), bit 1: can take short (2), both = 3
        uint256 quoteExpiry;     // 0 = no expiry
    }

    /// @notice Open perpetual position record
    struct Position {
        uint256 id;
        address trader;
        address lp;
        bytes32 strategyHash;
        bool isLong;             // trader's side: true = trader is long, false = short
        uint256 notional;
        uint256 leverage;
        uint256 entryPrice;      // 1e18 scaled
        uint256 traderMargin;    // held in this contract
        uint256 lpMargin;        // held in this contract (pulled via Aqua)
        uint256 openTimestamp;
        uint256 lastFundingTimestamp;
        bool fundingDefaulted;
        bool isOpen;
    }

    // --- CONSTANTS ---

    uint256 public constant BPS_BASE = 10_000;
    uint256 public constant FUNDING_INTERVAL = 8 hours;
    uint256 public constant MAX_FUNDING_RATE_BPS = 75; // 0.75% cap per interval
    uint256 public constant MAINTENANCE_MARGIN_BPS = 500; // 5% maintenance margin
    uint256 public constant KEEPER_FEE_BPS = 100; // 1% keeper liquidation fee

    // --- IMMUTABLES & STATE VARIABLES ---

    IERC20 public immutable COLLATERAL_TOKEN;
    IPriceOracle public oracle;
    address public owner;
    bool public paused;

    uint256 public nextPositionId = 1;

    /// @notice Open interest tracking for skew-based funding calculation
    uint256 public totalLongOi;
    uint256 public totalShortOi;

    /// @notice Storage mappings
    mapping(uint256 => Position) public positions;
    mapping(bytes32 => Strategy) public registeredStrategies;

    // --- EVENTS ---

    event StrategyRegistered(bytes32 indexed strategyHash, address indexed lp, uint256 maxNotional, uint256 maxLeverage, uint256 spreadBps, uint8 sideMask);
    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        address indexed lp,
        bytes32 strategyHash,
        bool isLong,
        uint256 notional,
        uint256 leverage,
        uint256 entryPrice,
        uint256 traderMargin,
        uint256 lpMargin
    );
    event FundingSettled(
        uint256 indexed positionId,
        int256 fundingAmount,
        bool lpOwesTrader,
        bool lpDefaulted,
        uint256 timestamp
    );
    event PositionLiquidated(
        uint256 indexed positionId,
        address indexed liquidator,
        uint256 reward,
        uint256 traderPayout,
        uint256 lpPayout,
        bool viaFundingDefault
    );
    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        address indexed lp,
        uint256 closePrice,
        uint256 traderPayout,
        uint256 lpPayout
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OracleUpdated(address indexed previousOracle, address indexed newOracle);
    event PausedStateChanged(bool isPaused);

    // --- CUSTOM ERRORS ---

    error OnlyOwner();
    error ContractPaused();
    error ZeroAddress();
    error InvalidLeverage();
    error InvalidNotional();
    error PositionNotOpen();
    error QuoteExpired();
    error SideNotAllowed();
    error ExceedsMaxNotional();
    error ExceedsMaxLeverage();
    error FundingIntervalNotReached();
    error NotLiquidatable();
    error OnlyTrader();
    error PullFailed();

    constructor(IAqua aqua, IERC20 collateralToken, IPriceOracle priceOracle) AquaApp(aqua) {
        if (address(aqua) == address(0) || address(collateralToken) == address(0) || address(priceOracle) == address(0)) {
            revert ZeroAddress();
        }
        COLLATERAL_TOKEN = collateralToken;
        oracle = priceOracle;
        owner = msg.sender;
    }

    // --- MODIFIERS ---

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    modifier whenNotPaused() {
        _checkNotPaused();
        _;
    }

    function _checkOwner() internal view {
        if (msg.sender != owner) revert OnlyOwner();
    }

    function _checkNotPaused() internal view {
        if (paused) revert ContractPaused();
    }

    // --- ADMIN FUNCTIONS ---

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setOracle(IPriceOracle newOracle) external onlyOwner {
        if (address(newOracle) == address(0)) revert ZeroAddress();
        address prev = address(oracle);
        oracle = newOracle;
        emit OracleUpdated(prev, address(newOracle));
    }

    function setPaused(bool isPaused) external onlyOwner {
        paused = isPaused;
        emit PausedStateChanged(isPaused);
    }

    // --- STRATEGY REGISTRATION & DISCOVERY ---

    /// @notice Registers and validates an LP strategy locally
    /// @param strategy The strategy parameters shipped by the LP
    /// @return strategyHash The keccak256 hash matching Aqua's ship() strategyHash
    function registerStrategy(Strategy calldata strategy) external returns (bytes32 strategyHash) {
        if (strategy.lp == address(0)) revert ZeroAddress();
        if (strategy.maxLeverage == 0) revert InvalidLeverage();
        if (strategy.maxNotional == 0) revert InvalidNotional();

        strategyHash = keccak256(abi.encode(strategy));
        registeredStrategies[strategyHash] = strategy;

        emit StrategyRegistered(
            strategyHash,
            strategy.lp,
            strategy.maxNotional,
            strategy.maxLeverage,
            strategy.spreadBps,
            strategy.sideMask
        );
    }

    // --- CORE LIFECYCLE: OPEN POSITION ---

    /// @notice Opens a perpetual position against a resting LP quote using strategy struct
    function openPosition(
        Strategy calldata strategy,
        bool isLong,
        uint256 notional,
        uint256 leverage
    ) external whenNotPaused nonReentrantStrategy(strategy.lp, keccak256(abi.encode(strategy))) returns (uint256) {
        bytes32 strategyHash = keccak256(abi.encode(strategy));
        if (registeredStrategies[strategyHash].lp == address(0)) {
            registeredStrategies[strategyHash] = strategy;
        }
        return _openPositionInternal(strategyHash, strategy, isLong, notional, leverage);
    }

    /// @notice Opens a perpetual position against a registered strategy hash
    function openPosition(
        bytes32 strategyHash,
        bool isLong,
        uint256 notional,
        uint256 leverage
    ) external whenNotPaused nonReentrantStrategy(registeredStrategies[strategyHash].lp, strategyHash) returns (uint256) {
        Strategy memory strategy = registeredStrategies[strategyHash];
        if (strategy.lp == address(0)) revert QuoteExpired();
        return _openPositionInternal(strategyHash, strategy, isLong, notional, leverage);
    }

    function _openPositionInternal(
        bytes32 strategyHash,
        Strategy memory strat,
        bool isLong,
        uint256 notional,
        uint256 leverage
    ) internal returns (uint256 positionId) {
        if (strat.quoteExpiry != 0 && block.timestamp > strat.quoteExpiry) revert QuoteExpired();
        if (notional == 0) revert InvalidNotional();
        if (notional > strat.maxNotional) revert ExceedsMaxNotional();
        if (leverage == 0 || leverage > strat.maxLeverage) revert ExceedsMaxLeverage();

        if (isLong && (strat.sideMask & 1 == 0)) revert SideNotAllowed();
        if (!isLong && (strat.sideMask & 2 == 0)) revert SideNotAllowed();

        uint256 totalTraderDeposit = getRequiredTraderMargin(notional, leverage, strat.spreadBps);
        uint256 traderMargin = notional / leverage;
        uint256 lpMargin = getRequiredLpMargin(notional, leverage);
        uint256 indexPrice = oracle.getPrice(strat.collateralToken);
        uint256 entryPrice = getFillPrice(indexPrice, isLong, strat.spreadBps);

        // 1. Pull trader deposit directly
        IERC20(strat.collateralToken).safeTransferFrom(msg.sender, address(this), totalTraderDeposit);

        // 2. Pull LP counter-margin via Aqua
        AQUA.pull(strat.lp, strategyHash, strat.collateralToken, lpMargin, address(this));

        // 3. Write position to storage
        positionId = nextPositionId++;
        positions[positionId] = Position({
            id: positionId,
            trader: msg.sender,
            lp: strat.lp,
            strategyHash: strategyHash,
            isLong: isLong,
            notional: notional,
            leverage: leverage,
            entryPrice: entryPrice,
            traderMargin: traderMargin,
            lpMargin: lpMargin,
            openTimestamp: block.timestamp,
            lastFundingTimestamp: block.timestamp,
            fundingDefaulted: false,
            isOpen: true
        });

        // 4. Update aggregate open interest
        if (isLong) {
            totalLongOi += notional;
        } else {
            totalShortOi += notional;
        }

        emit PositionOpened(
            positionId,
            msg.sender,
            strat.lp,
            strategyHash,
            isLong,
            notional,
            leverage,
            entryPrice,
            traderMargin,
            lpMargin
        );
    }

    // --- OTHER CORE LIFECYCLE FUNCTION STUBS ---

    /// @notice Settle discrete funding payment between trader held margin and LP wallet via Aqua
    function settleFunding(uint256 positionId) external pure returns (int256, bool) {
        positionId;
        revert("not implemented");
    }

    /// @notice Liquidates an underwater position or one in funding default
    function liquidate(uint256 positionId) external pure returns (uint256) {
        positionId;
        revert("not implemented");
    }

    /// @notice Voluntarily closes an open position at current index price
    function closePosition(uint256 positionId) external pure returns (int256, uint256, uint256) {
        positionId;
        revert("not implemented");
    }

    // --- VIEW / PURE HELPER FUNCTIONS ---

    /// @notice Fetches position record by id
    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    /// @notice Computes required trader deposit (margin + spread fee)
    function getRequiredTraderMargin(uint256 notional, uint256 leverage, uint256 spreadBps) public pure returns (uint256) {
        if (leverage == 0) revert InvalidLeverage();
        uint256 traderMargin = notional / leverage;
        uint256 spreadFee = (notional * spreadBps) / BPS_BASE;
        return traderMargin + spreadFee;
    }

    /// @notice Computes required LP counter-margin to pull via Aqua
    function getRequiredLpMargin(uint256 notional, uint256 leverage) public pure returns (uint256) {
        if (leverage == 0) revert InvalidLeverage();
        return notional / leverage;
    }

    /// @notice Computes fill price adjusting index price by LP spread
    function getFillPrice(uint256 indexPrice, bool isLong, uint256 spreadBps) public pure returns (uint256) {
        uint256 spreadAdjustment = (indexPrice * spreadBps) / BPS_BASE;
        return isLong ? indexPrice + spreadAdjustment : indexPrice - spreadAdjustment;
    }

    /// @notice Calculates realized PnL of trader
    function calculatePnl(bool isLong, uint256 notional, uint256 entryPrice, uint256 currentPrice) public pure returns (int256) {
        if (entryPrice == 0) return 0;
        if (isLong) {
            if (currentPrice >= entryPrice) {
                return ((notional * (currentPrice - entryPrice)) / entryPrice).toInt256();
            } else {
                return -((notional * (entryPrice - currentPrice)) / entryPrice).toInt256();
            }
        } else {
            if (currentPrice <= entryPrice) {
                return ((notional * (entryPrice - currentPrice)) / entryPrice).toInt256();
            } else {
                return -((notional * (currentPrice - entryPrice)) / entryPrice).toInt256();
            }
        }
    }

    /// @notice Evaluates current skew-based funding rate and payment direction
    function getFundingRate(uint256 elapsedSeconds) public view returns (uint256 rateBps, bool longPaysShort) {
        uint256 totalOi = totalLongOi + totalShortOi;
        if (totalOi == 0 || elapsedSeconds == 0) {
            return (0, false);
        }

        uint256 skewBps;
        if (totalLongOi >= totalShortOi) {
            longPaysShort = true;
            skewBps = ((totalLongOi - totalShortOi) * BPS_BASE) / totalOi;
        } else {
            longPaysShort = false;
            skewBps = ((totalShortOi - totalLongOi) * BPS_BASE) / totalOi;
        }

        rateBps = (skewBps * MAX_FUNDING_RATE_BPS * elapsedSeconds) / (FUNDING_INTERVAL * BPS_BASE);
        if (rateBps > MAX_FUNDING_RATE_BPS) {
            rateBps = MAX_FUNDING_RATE_BPS;
        }
    }

    /// @notice Checks if a position is eligible for liquidation
    function isLiquidatable(uint256 positionId) public view returns (bool liquidatable, bool viaFundingDefault) {
        Position storage pos = positions[positionId];
        if (!pos.isOpen) return (false, false);

        if (pos.fundingDefaulted) {
            return (true, true);
        }

        uint256 currentPrice = oracle.getPrice(address(COLLATERAL_TOKEN));
        int256 pnl = calculatePnl(pos.isLong, pos.notional, pos.entryPrice, currentPrice);
        uint256 maintenanceReq = (pos.notional * MAINTENANCE_MARGIN_BPS) / BPS_BASE;

        if (pnl < 0) {
            uint256 traderLoss = (-pnl).toUint256();
            if (traderLoss >= pos.traderMargin) return (true, false);
            uint256 remainingTraderMargin = pos.traderMargin - traderLoss;
            if (remainingTraderMargin < maintenanceReq) return (true, false);
        } else if (pnl > 0) {
            uint256 lpLoss = pnl.toUint256();
            if (lpLoss >= pos.lpMargin) return (true, false);
            uint256 remainingLpMargin = pos.lpMargin - lpLoss;
            if (remainingLpMargin < maintenanceReq) return (true, false);
        }

        return (false, false);
    }
}