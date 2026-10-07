// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SafePayroll} from "../src/SafePayroll.sol";

contract DemoSetup is Script {
    function run() external {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        address usdcAddr = vm.parseJsonAddress(json, ".usdc");
        address payrollAddr = vm.parseJsonAddress(json, ".payroll");

        address tan = vm.envAddress("TAN");
        address bob = vm.envAddress("BOB");
        address carol = vm.envAddress("CAROL");

        MockUSDC usdc = MockUSDC(usdcAddr);
        SafePayroll payroll = SafePayroll(payrollAddr);

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        require(broadcaster == payroll.employer(), "DemoSetup: broadcast as the payroll employer");
        setup(usdc, payroll, broadcaster, tan, bob, carol);
        vm.stopBroadcast();

        console2.log("employeeCount", payroll.employeeCount());
    }

    function setup(MockUSDC usdc, SafePayroll payroll, address employer, address tan, address bob, address carol)
        public
    {
        usdc.mint(employer, 1_000_000e6);
        usdc.approve(address(payroll), type(uint256).max);
        payroll.addEmployee(tan, 3_000e6);
        payroll.addEmployee(bob, 4_000e6);
        payroll.addEmployee(carol, 5_000e6);
    }
}
