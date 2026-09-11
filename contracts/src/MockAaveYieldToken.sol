// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title MockAaveYieldToken
/// @notice High-yield rebasing collateral token simulating Aave v3 aUSDC for live Arbitrum One testing
/// @dev Implements a 6-decimal rebasing ERC-20 token where wallet balances accrue yield continuously over time.
///      Also provides full Aave v3 IAToken view methods and optional ERC-4626 view helpers.
contract MockAaveYieldToken is IERC20, IERC20Metadata {
    // --- CONSTANTS ---

    string private constant _NAME = "Flyte Aave Yield aUSDC";
    string private constant _SYMBOL = "aUSDC";
    uint8 private constant _DECIMALS = 6;

    /// @dev 1.0 in Ray precision (1e27), matching Aave v3 index math
    uint256 public constant RAY = 1e27;

    /// @dev Arbitrum One native USDC address for reference
    address public constant UNDERLYING = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    /// @dev Faucet default: 5,000 nominal aUSDC (6 decimals)
    uint256 public constant FAUCET_AMOUNT = 5_000 * 1e6;

    /// @dev Yield rate calibration: 1.00% every 15 minutes (900 seconds)
    ///      Rate = 1% / 900s = 0.01 / 900 = 1 / 90,000 per second.
    uint256 public constant YIELD_PERIOD_SECONDS = 900;
    uint256 public constant YIELD_PERCENT_PER_PERIOD = 1;

    // --- STATE VARIABLES ---

    uint256 public immutable startTimestamp;
    address public owner;

    mapping(address => uint256) private _scaledBalances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalScaledSupply;

    // --- EVENTS ---

    event FaucetMinted(address indexed recipient, uint256 nominalAmount, uint256 scaledAmount);
    event TokensMinted(address indexed recipient, uint256 nominalAmount, uint256 scaledAmount);
    event TokensBurned(address indexed from, uint256 nominalAmount, uint256 scaledAmount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // --- ERRORS ---

    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidAmount();
    error ZeroAddress();
    error OnlyOwner();

    // --- MODIFIERS ---

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // --- CONSTRUCTOR ---

    constructor() {
        owner = msg.sender;
        startTimestamp = block.timestamp;
    }

    // --- METADATA (IERC20Metadata) ---

    function name() external pure override returns (string memory) {
        return _NAME;
    }

    function symbol() external pure override returns (string memory) {
        return _SYMBOL;
    }

    function decimals() external pure override returns (uint8) {
        return _DECIMALS;
    }

    // --- YIELD REBASING ENGINE ---

    /// @notice Returns the normalized income / liquidity index in Ray (1e27)
    /// @dev Linearly accrues 1% per 900 seconds (15 minutes).
    ///      Index(t) = RAY + (elapsedSeconds * RAY) / 90000
    function getNormalizedIncome() public view returns (uint256) {
        uint256 elapsed = block.timestamp - startTimestamp;
        return RAY + (elapsed * RAY) / (YIELD_PERIOD_SECONDS * 100);
    }

    /// @notice Returns the annualized percentage yield (APY) representation for UI display
    /// @dev 1% per 15 minutes annualized (35,040 periods/year)
    function getAPY() external pure returns (uint256) {
        return 3504; // ~3,504% nominal APY
    }

    // --- BALANCE & SUPPLY (IERC20) ---

    /// @notice Returns the rebasing nominal balance of an account in USDC units (6 decimals)
    function balanceOf(address account) public view override returns (uint256) {
        return (_scaledBalances[account] * getNormalizedIncome()) / RAY;
    }

    /// @notice Returns the total rebasing nominal supply across all accounts
    function totalSupply() public view override returns (uint256) {
        return (_totalScaledSupply * getNormalizedIncome()) / RAY;
    }

    /// @notice Returns the internal scaled balance (in Ray shares) of an account
    function scaledBalanceOf(address account) external view returns (uint256) {
        return _scaledBalances[account];
    }

    /// @notice Returns the total internal scaled supply
    function scaledTotalSupply() external view returns (uint256) {
        return _totalScaledSupply;
    }

    // --- FAUCET & MINTING ---

    /// @notice Public faucet allowing any user to mint 5,000 nominal aUSDC
    function faucet() external {
        _mintNominal(msg.sender, FAUCET_AMOUNT);
        emit FaucetMinted(msg.sender, FAUCET_AMOUNT, (_scaledBalances[msg.sender]));
    }

    /// @notice Mint arbitrary nominal aUSDC amount to a recipient (for testing / admin seeding)
    function mint(address to, uint256 nominalAmount) external {
        if (to == address(0)) revert ZeroAddress();
        if (nominalAmount == 0) revert InvalidAmount();
        _mintNominal(to, nominalAmount);
        emit TokensMinted(to, nominalAmount, _scaledBalances[to]);
    }

    /// @notice Burn nominal aUSDC amount from a specified account
    function burn(address from, uint256 nominalAmount) external {
        if (from == address(0)) revert ZeroAddress();
        if (nominalAmount == 0) revert InvalidAmount();
        if (msg.sender != from) {
            uint256 currentAllowance = _allowances[from][msg.sender];
            if (currentAllowance != type(uint256).max) {
                if (currentAllowance < nominalAmount) revert InsufficientAllowance();
                _allowances[from][msg.sender] = currentAllowance - nominalAmount;
            }
        }
        _burnNominal(from, nominalAmount);
        emit TokensBurned(from, nominalAmount, _scaledBalances[from]);
    }

    // --- TRANSFERS & ALLOWANCES (IERC20) ---

    function transfer(address to, uint256 nominalAmount) external override returns (bool) {
        _transferNominal(msg.sender, to, nominalAmount);
        return true;
    }

    function allowance(address tokenOwner, address spender) external view override returns (uint256) {
        return _allowances[tokenOwner][spender];
    }

    function approve(address spender, uint256 nominalAmount) external override returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        _allowances[msg.sender][spender] = nominalAmount;
        emit Approval(msg.sender, spender, nominalAmount);
        return true;
    }

    function transferFrom(address from, address to, uint256 nominalAmount) external override returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < nominalAmount) revert InsufficientAllowance();
            _allowances[from][msg.sender] = currentAllowance - nominalAmount;
        }
        _transferNominal(from, to, nominalAmount);
        return true;
    }

    // --- INTERNAL HELPERS ---

    function _mintNominal(address to, uint256 nominalAmount) internal {
        uint256 income = getNormalizedIncome();
        uint256 scaledAmount = (nominalAmount * RAY) / income;
        if (scaledAmount == 0 && nominalAmount > 0) {
            scaledAmount = 1;
        }

        _scaledBalances[to] += scaledAmount;
        _totalScaledSupply += scaledAmount;

        emit Transfer(address(0), to, nominalAmount);
    }

    function _burnNominal(address from, uint256 nominalAmount) internal {
        uint256 userNominalBal = balanceOf(from);
        if (userNominalBal < nominalAmount) revert InsufficientBalance();

        uint256 income = getNormalizedIncome();
        uint256 scaledAmount = (nominalAmount * RAY) / income;
        
        // Clean dust sweep when burning entire balance
        if (nominalAmount >= userNominalBal || scaledAmount > _scaledBalances[from]) {
            scaledAmount = _scaledBalances[from];
        }

        _scaledBalances[from] -= scaledAmount;
        _totalScaledSupply -= scaledAmount;

        emit Transfer(from, address(0), nominalAmount);
    }

    function _transferNominal(address from, address to, uint256 nominalAmount) internal {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (nominalAmount == 0) return;

        uint256 userNominalBal = balanceOf(from);
        if (userNominalBal < nominalAmount) revert InsufficientBalance();

        uint256 income = getNormalizedIncome();
        uint256 scaledAmount = (nominalAmount * RAY) / income;

        // Clean dust sweep when transferring entire balance
        if (nominalAmount >= userNominalBal || scaledAmount > _scaledBalances[from]) {
            scaledAmount = _scaledBalances[from];
        }

        _scaledBalances[from] -= scaledAmount;
        _scaledBalances[to] += scaledAmount;

        emit Transfer(from, to, nominalAmount);
    }

    // --- AAVE V3 & ERC-4626 VIEW COMPATIBILITY ---

    /// @notice Aave v3 Pool reference
    function POOL() external view returns (address) {
        return address(this);
    }

    /// @notice Aave v3 underlying asset address
    function UNDERLYING_ASSET_ADDRESS() external pure returns (address) {
        return UNDERLYING;
    }

    /// @notice Aave v3 scaled balance and supply tuple
    function getScaledUserBalanceAndSupply(address user) external view returns (uint256, uint256) {
        return (_scaledBalances[user], _totalScaledSupply);
    }

    /// @notice ERC-4626 underlying asset
    function asset() external pure returns (address) {
        return UNDERLYING;
    }

    /// @notice ERC-4626 total managed assets
    function totalAssets() external view returns (uint256) {
        return totalSupply();
    }

    /// @notice ERC-4626 shares to assets conversion
    function convertToAssets(uint256 shares) external view returns (uint256) {
        return (shares * getNormalizedIncome()) / RAY;
    }

    /// @notice ERC-4626 assets to shares conversion
    function convertToShares(uint256 assets) external view returns (uint256) {
        return (assets * RAY) / getNormalizedIncome();
    }

    // --- GOVERNANCE ---

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }
}
