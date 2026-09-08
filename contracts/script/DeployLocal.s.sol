// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console } from "forge-std/Script.sol";
import { PerpAquaApp } from "../src/PerpAquaApp.sol";
import { MockPriceOracle } from "../src/MockPriceOracle.sol";
import { PerpSwapVMRouter } from "../src/swap-vm/routers/PerpSwapVMRouter.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DeployLocal is Script {
    address constant AQUA_REGISTRY = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address constant A_USDC = 0x724dc807b04555b71ed48a6896b6F41593b8C637;

    // Deployer is Anvil Account #0
    uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external {
        vm.startBroadcast(deployerPrivateKey);

        MockPriceOracle oracle = new MockPriceOracle();
        oracle.setPrice(A_USDC, 60_000e18); // $60k BTC index

        PerpAquaApp app = new PerpAquaApp(IAqua(AQUA_REGISTRY), IERC20(A_USDC), oracle);
        PerpSwapVMRouter router = new PerpSwapVMRouter(
            AQUA_REGISTRY,
            0x82aF49447D8a07e3bd95BD0d56f35241523fBab1,
            vm.addr(deployerPrivateKey),
            "FlytePerpSwapVM",
            "1"
        );
        app.setSwapVmRouter(router);

        vm.stopBroadcast();

        console.log("-----------------------------------------");
        console.log("MockPriceOracle deployed at:", address(oracle));
        console.log("PerpAquaApp deployed at:    ", address(app));
        console.log("PerpSwapVMRouter deployed at:", address(router));
        console.log("-----------------------------------------");
    }
}
