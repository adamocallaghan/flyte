// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IPriceOracle
/// @notice Interface for mock/spot price feeds
interface IPriceOracle {
    function getPrice(address asset) external view returns (uint256); // 1e18-scaled
}

/// @title MockPriceOracle
/// @notice Owner-settable price oracle for reproducible test scenarios and live demos
/// @dev In production, this can be swapped with Chainlink or 1inch Spot Price API.
///      This is explicitly a deterministic placeholder for demo control, not an endorsement of centralized price-setting.
contract MockPriceOracle is IPriceOracle {
    address public owner;
    mapping(address => uint256) public prices;

    event PriceUpdated(address indexed asset, uint256 newPrice);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error OnlyOwner();
    error InvalidPrice();

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function _checkOwner() internal view {
        if (msg.sender != owner) revert OnlyOwner();
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setPrice(address asset, uint256 price) external onlyOwner {
        if (price == 0) revert InvalidPrice();
        prices[asset] = price;
        emit PriceUpdated(asset, price);
    }

    function getPrice(address asset) external view returns (uint256) {
        return prices[asset];
    }
}