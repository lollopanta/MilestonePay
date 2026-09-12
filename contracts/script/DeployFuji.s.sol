// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {EscrowFactory} from "../src/EscrowFactory.sol";
import {MockUSDT} from "../src/testnet/MockUSDT.sol";

contract DeployFuji is Script {
    function run() external returns (MockUSDT token, EscrowFactory factory) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        token = new MockUSDT();
        factory = new EscrowFactory();
        vm.stopBroadcast();
    }
}
