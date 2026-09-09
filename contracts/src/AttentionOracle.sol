// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IPriceOracle } from "./MockPriceOracle.sol";

/// @title AttentionOracle
/// @notice Ground Truth Attention Oracle for Cultural & Trend Markets
/// @dev Powered by Chainlink Runtime Environment (CRE) Confidential Workflows running in hardware-isolated TEEs.
///      Maintains 100% compatibility with IPriceOracle so PerpAquaApp can trade Attention perps seamlessly.
contract AttentionOracle is IPriceOracle {
    // --- STRUCTS ---

    struct AttentionData {
        string name;
        uint256 indexPrice;      // 1e18-scaled USD price
        int256 sentimentScore;   // scaled x100 (e.g. 56 = +0.56, -30 = -0.30)
        uint256 socialVelocity;  // 0 - 100 velocity score
        uint256 newsMentions24h; // 24-hour media & news count
        uint256 lastUpdatedAt;   // unix timestamp
        bool isConfigured;
    }

    // --- STATE VARIABLES ---

    address public owner;
    mapping(address => bool) public authorizedReporters;

    // Asset address -> 1e18 price (implements IPriceOracle)
    mapping(address => uint256) public prices;

    // Market identifier ("ROBOTS", "GTA6", "DEEPSEEK") -> AttentionData
    mapping(string => AttentionData) public attentionMarkets;
    mapping(string => address) public marketToAsset;
    mapping(address => string) public assetToMarket;

    string[] public registeredMarketIds;

    // --- EVENTS ---

    event AttentionReportUpdated(
        string indexed marketId,
        uint256 indexPrice,
        int256 sentimentScore,
        uint256 socialVelocity,
        uint256 newsMentions24h,
        uint256 timestamp
    );
    event PriceUpdated(address indexed asset, uint256 newPrice);
    event MarketRegistered(string indexed marketId, string name, address indexed assetAddress, uint256 initialPrice);
    event ReporterUpdated(address indexed reporter, bool isAuthorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // --- ERRORS ---

    error OnlyOwner();
    error OnlyReporterOrOwner();
    error InvalidPrice();
    error MarketNotFound(string marketId);
    error ZeroAddress();

    // --- MODIFIERS ---

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyReporterOrOwner() {
        if (msg.sender != owner && !authorizedReporters[msg.sender]) revert OnlyReporterOrOwner();
        _;
    }

    // --- CONSTRUCTOR ---

    constructor() {
        owner = msg.sender;
        authorizedReporters[msg.sender] = true;
    }

    // --- GOVERNANCE ---

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setReporter(address reporter, bool isAuthorized) external onlyOwner {
        if (reporter == address(0)) revert ZeroAddress();
        authorizedReporters[reporter] = isAuthorized;
        emit ReporterUpdated(reporter, isAuthorized);
    }

    function registerMarket(
        string calldata marketId,
        string calldata name,
        address assetAddress,
        uint256 initialPrice
    ) external onlyOwner {
        if (assetAddress == address(0)) revert ZeroAddress();
        if (initialPrice == 0) revert InvalidPrice();

        if (!attentionMarkets[marketId].isConfigured) {
            registeredMarketIds.push(marketId);
        }

        attentionMarkets[marketId] = AttentionData({
            name: name,
            indexPrice: initialPrice,
            sentimentScore: 50, // default neutral-positive (+0.50)
            socialVelocity: 70, // default baseline velocity
            newsMentions24h: 50000,
            lastUpdatedAt: block.timestamp,
            isConfigured: true
        });

        marketToAsset[marketId] = assetAddress;
        assetToMarket[assetAddress] = marketId;
        prices[assetAddress] = initialPrice;

        emit MarketRegistered(marketId, name, assetAddress, initialPrice);
        emit PriceUpdated(assetAddress, initialPrice);
    }

    // --- REPORTING & ORACLE UPDATES ---

    /// @notice Update single market attention report (called by CRE TEE consensus forwarder or keeper)
    function updateAttentionReport(
        string calldata marketId,
        uint256 newPrice,
        int256 sentimentScore,
        uint256 socialVelocity,
        uint256 newsMentions24h
    ) public onlyReporterOrOwner {
        if (newPrice == 0) revert InvalidPrice();
        if (!attentionMarkets[marketId].isConfigured) revert MarketNotFound(marketId);

        AttentionData storage data = attentionMarkets[marketId];
        data.indexPrice = newPrice;
        data.sentimentScore = sentimentScore;
        data.socialVelocity = socialVelocity;
        data.newsMentions24h = newsMentions24h;
        data.lastUpdatedAt = block.timestamp;

        address asset = marketToAsset[marketId];
        if (asset != address(0)) {
            prices[asset] = newPrice;
            emit PriceUpdated(asset, newPrice);
        }

        emit AttentionReportUpdated(
            marketId,
            newPrice,
            sentimentScore,
            socialVelocity,
            newsMentions24h,
            block.timestamp
        );
    }

    /// @notice Batch update attention reports in a single transaction
    function batchUpdateAttentionReports(
        string[] calldata marketIds,
        uint256[] calldata newPrices,
        int256[] calldata sentiments,
        uint256[] calldata velocities,
        uint256[] calldata mentions
    ) external onlyReporterOrOwner {
        uint256 len = marketIds.length;
        for (uint256 i = 0; i < len; i++) {
            updateAttentionReport(marketIds[i], newPrices[i], sentiments[i], velocities[i], mentions[i]);
        }
    }

    /// @notice Direct price setter (preserves backwards-compatibility with existing demo sliders)
    function setPrice(address asset, uint256 price) external onlyReporterOrOwner {
        if (price == 0) revert InvalidPrice();
        prices[asset] = price;

        string memory marketId = assetToMarket[asset];
        if (bytes(marketId).length > 0 && attentionMarkets[marketId].isConfigured) {
            attentionMarkets[marketId].indexPrice = price;
            attentionMarkets[marketId].lastUpdatedAt = block.timestamp;
        }

        emit PriceUpdated(asset, price);
    }

    // --- VIEW FUNCTIONS ---

    /// @notice IPriceOracle interface compliance for PerpAquaApp
    function getPrice(address asset) external view override returns (uint256) {
        return prices[asset];
    }

    function getAttentionData(string calldata marketId) external view returns (AttentionData memory) {
        return attentionMarkets[marketId];
    }

    function getAllMarketIds() external view returns (string[] memory) {
        return registeredMarketIds;
    }
}
