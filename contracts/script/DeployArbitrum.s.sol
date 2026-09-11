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

        // Seed 24-hour historical hourly baseline reports for all 3 markets
        _seedBaselineReports(oracle);

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

    function _seedBaselineReports(AttentionOracle oracle) internal {
        uint256 baseTime = block.timestamp > 86400 ? block.timestamp - 86400 : 1000;

        AttentionOracle.HistoricalReport[] memory robotsHistory = new AttentionOracle.HistoricalReport[](24);
        AttentionOracle.HistoricalReport[] memory gta6History = new AttentionOracle.HistoricalReport[](24);
        AttentionOracle.HistoricalReport[] memory deepseekHistory = new AttentionOracle.HistoricalReport[](24);

        int256[24] memory robotsPriceDeltas = [
            int256(7120), 7140, 7180, 7150, 7210, 7260, 7230, 7290,
            7310, 7350, 7320, 7380, 7420, 7390, 7450, 7480,
            7440, 7500, 7520, 7490, 7530, 7510, 7540, 7550
        ];

        int256[24] memory gta6PriceDeltas = [
            int256(3950), 3970, 3990, 3980, 4010, 4030, 4050, 4040,
            4070, 4090, 4110, 4100, 4130, 4150, 4140, 4160,
            4180, 4170, 4190, 4200, 4190, 4210, 4200, 4210
        ];

        int256[24] memory deepseekPriceDeltas = [
            int256(8120), 8160, 8210, 8250, 8300, 8350, 8420, 8480,
            8530, 8590, 8640, 8680, 8720, 8760, 8790, 8820,
            8850, 8810, 8840, 8820, 8860, 8830, 8850, 8840
        ];

        for (uint256 i = 0; i < 24; i++) {
            uint256 t = baseTime + (i * 3600);

            robotsHistory[i] = AttentionOracle.HistoricalReport({
                timestamp: t,
                indexPrice: uint256(uint256(robotsPriceDeltas[i]) * 1e16),
                sentimentScore: int256(40 + (i % 25)),
                socialVelocity: uint32(65 + (i % 25)),
                newsMentions24h: uint32(45000 + (i * 550))
            });

            gta6History[i] = AttentionOracle.HistoricalReport({
                timestamp: t,
                indexPrice: uint256(uint256(gta6PriceDeltas[i]) * 1e16),
                sentimentScore: int256(55 + (i % 20)),
                socialVelocity: uint32(70 + (i % 20)),
                newsMentions24h: uint32(60000 + (i * 1200))
            });

            deepseekHistory[i] = AttentionOracle.HistoricalReport({
                timestamp: t,
                indexPrice: uint256(uint256(deepseekPriceDeltas[i]) * 1e16),
                sentimentScore: int256(60 + (i % 25)),
                socialVelocity: uint32(75 + (i % 20)),
                newsMentions24h: uint32(50000 + (i * 900))
            });
        }

        oracle.seedHistoricalReports("ROBOTS", robotsHistory);
        oracle.seedHistoricalReports("GTA6", gta6History);
        oracle.seedHistoricalReports("DEEPSEEK", deepseekHistory);
        console.log("Seeded 24 hours of baseline historical attention reports for all markets");
    }
}
