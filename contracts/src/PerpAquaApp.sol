// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AquaApp } from "@1inch/aqua/src/AquaApp.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IPriceOracle } from "./MockPriceOracle.sol";

/// @title PerpAquaApp
/// @notice JIT-sourced RFQ Perpetual Futures DEX built on 1inch Aqua & SwapVM
/// @dev Counter-margin is just-in-time sourced from maker wallets holding Aave aTokens via Aqua.
abstract contract PerpAquaApp is AquaApp {
    using SafeERC20 for IERC20;

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
}