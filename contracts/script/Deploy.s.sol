// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {TombstoneRegistry} from "../src/TombstoneRegistry.sol";
import {TombstoneGuard} from "../src/TombstoneGuard.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SafePayroll} from "../src/SafePayroll.sol";
import {SweeperMock} from "../src/SweeperMock.sol";
import {ITombstone} from "../src/ITombstone.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Deploy is Script {
    uint256 constant SEPOLIA = 11155111;
    uint256 constant BASE_SEPOLIA = 84532;
    uint256 constant ARBITRUM_SEPOLIA = 421614;

    struct Deployment {
        uint256 chainId;
        address forwarder;
        address registry;
        address guard;
        address usdc;
        address payroll;
        address sweeper;
    }

    function mockForwarder(uint256 chainId) public pure returns (address) {
        if (chainId == SEPOLIA) return 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;
        if (chainId == BASE_SEPOLIA) return 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5;
        if (chainId == ARBITRUM_SEPOLIA) return 0xD41263567DdfeAd91504199b8c6c87371e83ca5d;
        return address(0);
    }

    function run() external {
        uint256 chainId = block.chainid;
        address forwarder = vm.envOr("FORWARDER", mockForwarder(chainId));
        require(forwarder != address(0), "Deploy: unsupported chain; set FORWARDER");
        uint8 minClean = uint8(vm.envOr("MIN_CLEAN_SCANS", uint256(2)));

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        address employer = vm.envOr("EMPLOYER", broadcaster);
        address thief = vm.envOr("THIEF", broadcaster);
        Deployment memory d = deploy(chainId, forwarder, minClean, employer, thief);
        vm.stopBroadcast();

        _log(d);
        _writeJson(d);
    }

    function deploy(uint256 chainId, address forwarder, uint8 minClean, address employer, address thief)
        public
        returns (Deployment memory d)
    {
        d.chainId = chainId;
        d.forwarder = forwarder;

        TombstoneRegistry reg = new TombstoneRegistry(forwarder, minClean);
        d.registry = address(reg);
        d.guard = address(new TombstoneGuard(ITombstone(address(reg))));

        if (chainId == SEPOLIA || chainId == 31337) {
            MockUSDC usdc = new MockUSDC();
            d.usdc = address(usdc);
            d.payroll = address(new SafePayroll(IERC20(address(usdc)), ITombstone(address(reg)), employer));
            d.sweeper = address(new SweeperMock(payable(thief)));
        }
    }

    function _log(Deployment memory d) internal pure {
        console2.log("chainId  ", d.chainId);
        console2.log("forwarder", d.forwarder);
        console2.log("registry ", d.registry);
        console2.log("guard    ", d.guard);
        console2.log("usdc     ", d.usdc);
        console2.log("payroll  ", d.payroll);
        console2.log("sweeper  ", d.sweeper);
    }

    function _writeJson(Deployment memory d) internal {
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", d.chainId);
        vm.serializeAddress(obj, "forwarder", d.forwarder);
        vm.serializeAddress(obj, "registry", d.registry);
        vm.serializeAddress(obj, "guard", d.guard);
        vm.serializeAddress(obj, "usdc", d.usdc);
        vm.serializeAddress(obj, "payroll", d.payroll);
        string memory json = vm.serializeAddress(obj, "sweeper", d.sweeper);
        string memory path = string.concat("deployments/", vm.toString(d.chainId), ".json");
        vm.writeJson(json, path);
    }
}
