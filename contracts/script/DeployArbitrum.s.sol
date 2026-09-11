// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console } from "forge-std/Script.sol";
import { MockAaveYieldToken } from "../src/MockAaveYieldToken.sol";
import { PerpAquaApp } from "../src/PerpAquaApp.sol";
import { AttentionOracle } from "../src/AttentionOracle.sol";
import { PerpSwapVMRouter } from "../src/swap-vm/routers/PerpSwapVMRouter.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title DeployArbitrum
/// @notice Production deployment script for Flyte protocol on Arbitrum One
/// @dev Deploys MockAaveYieldToken, AttentionOracle, PerpAquaApp, and PerpSwapVMRouter
contract DeployArbitrum is Script {
    // Canonical 1inch Aqua on Arbitrum One
    address public constant AQUA_REGISTRY = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;

    // Canonical WETH on Arbitrum One
    address public constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    // Virtual asset identifiers for Cultural Attention Markets
    address public constant MARKET_ROBOTS = 0x1111111111111111111111111111111111110001;
    address public constant MARKET_GTA6 = 0x1111111111111111111111111111111111110002;
    address public constant MARKET_DEEPSEEK = 0x1111111111111111111111111111111111110003;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=================================================");
        console.log("Deploying Flyte to Arbitrum One");
        console.log("Deployer Address:", deployer);
        console.log("1inch Aqua:      ", AQUA_REGISTRY);
        console.log("WETH:            ", WETH);
        console.log("=================================================");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockAaveYieldToken (rebasing yield token + faucet)
        MockAaveYieldToken aUsdc = new MockAaveYieldToken();

        // 2. Deploy AttentionOracle
        AttentionOracle oracle = new AttentionOracle();

        // Register initial cultural attention markets with baseline indices
        oracle.registerMarket("ROBOTS", "Humanoid Robots", MARKET_ROBOTS, 75.50e18);
        oracle.registerMarket("GTA6", "Grand Theft Auto VI", MARKET_GTA6, 42.10e18);
        oracle.registerMarket("DEEPSEEK", "DeepSeek AI", MARKET_DEEPSEEK, 88.40e18);

        // Set default collateral/settlement price on oracle for PerpAquaApp compatibility
        oracle.setPrice(address(aUsdc), 75.50e18);

        // Authorize optional CRE reporter if configured in environment
        address creReporter = vm.envOr("CRE_REPORTER_ADDRESS", address(0));
        if (creReporter != address(0)) {
            oracle.setReporter(creReporter, true);
            console.log("Authorized CRE Reporter:", creReporter);
        }

        // 3. Deploy PerpAquaApp
        PerpAquaApp app = new PerpAquaApp(IAqua(AQUA_REGISTRY), IERC20(address(aUsdc)), oracle);

        // 4. Deploy PerpSwapVMRouter
        PerpSwapVMRouter router = new PerpSwapVMRouter(
            AQUA_REGISTRY,
            WETH,
            deployer,
            "FlytePerpSwapVM",
            "1"
        );

        // 5. Connect router to app
        app.setSwapVmRouter(router);

        vm.stopBroadcast();

        console.log("=================================================");
        console.log("DEPLOYMENT COMPLETE (ARBITRUM ONE)");
        console.log("MockAaveYieldToken (aUSDC):", address(aUsdc));
        console.log("AttentionOracle:           ", address(oracle));
        console.log("PerpAquaApp:               ", address(app));
        console.log("PerpSwapVMRouter:          ", address(router));
        console.log("=================================================");
        console.log("Copy-Paste Environment Variables for Frontend / CRE:");
        console.log("NEXT_PUBLIC_A_USDC_ADDRESS=", address(aUsdc));
        console.log("NEXT_PUBLIC_ATTENTION_ORACLE_ADDRESS=", address(oracle));
        console.log("NEXT_PUBLIC_PERP_APP_ADDRESS=", address(app));
        console.log("NEXT_PUBLIC_SWAP_VM_ROUTER_ADDRESS=", address(router));
        console.log("=================================================");
    }
}
