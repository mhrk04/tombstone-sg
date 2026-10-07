// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployTest is Test {
    Deploy dep;

    address employer = address(0xE1);
    address thief = address(0xBAD);

    function setUp() public {
        dep = new Deploy();
    }

    function test_mockForwardersMatchCreDirectory() public view {
        assertEq(dep.mockForwarder(11155111), 0x15fC6ae953E024d975e77382eEeC56A9101f9F88, "sepolia");
        assertEq(dep.mockForwarder(84532), 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5, "base sepolia");
        assertEq(dep.mockForwarder(421614), 0xD41263567DdfeAd91504199b8c6c87371e83ca5d, "arb sepolia");
        assertEq(dep.mockForwarder(1), address(0), "unsupported chain -> zero");
    }

    function test_sepoliaGetsFullStack() public {
        Deploy.Deployment memory d = dep.deploy(11155111, dep.mockForwarder(11155111), 2, employer, thief);
        assertTrue(d.registry != address(0), "registry");
        assertTrue(d.guard != address(0), "guard");
        assertTrue(d.usdc != address(0), "usdc on sepolia");
        assertTrue(d.payroll != address(0), "payroll on sepolia");
        assertTrue(d.sweeper != address(0), "sweeper on sepolia");
    }

    function test_l2TestnetsGetRegistryOnly() public {
        Deploy.Deployment memory b = dep.deploy(84532, dep.mockForwarder(84532), 2, employer, thief);
        assertTrue(b.registry != address(0), "base registry");
        assertTrue(b.guard != address(0), "base guard");
        assertEq(b.usdc, address(0), "no usdc on base sepolia");
        assertEq(b.payroll, address(0), "no payroll on base sepolia");
        assertEq(b.sweeper, address(0), "no sweeper on base sepolia");

        Deploy.Deployment memory a = dep.deploy(421614, dep.mockForwarder(421614), 2, employer, thief);
        assertTrue(a.registry != address(0), "arb registry");
        assertEq(a.payroll, address(0), "no payroll on arb sepolia");
    }
}
