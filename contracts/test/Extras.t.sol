// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {CodeReader} from "../src/CodeReader.sol";
import {SweeperMock} from "../src/SweeperMock.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SafePayroll} from "../src/SafePayroll.sol";
import {TombstoneRegistry} from "../src/TombstoneRegistry.sol";
import {ITombstone} from "../src/ITombstone.sol";
import {DemoSetup} from "../script/DemoSetup.s.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ExtrasTest is Test {
    uint256 constant tanKey = 0xA11CE;
    address tan = vm.addr(tanKey);
    address plain = address(0xBEEF);
    address payable thief = payable(address(0xBAD));

    function test_codeReaderReturnsEip7702Designators() public {
        SweeperMock sweeper = new SweeperMock(thief);

        // delegate tan to the sweeper (EIP-7702)
        Vm.SignedDelegation memory d = vm.signDelegation(address(sweeper), tanKey);
        vm.attachDelegation(d);

        address[] memory wallets = new address[](2);
        wallets[0] = tan;
        wallets[1] = plain;

        // deployless construct: run CodeReader's creationCode with the args, read return data
        bytes memory initcode = abi.encodePacked(type(CodeReader).creationCode, abi.encode(wallets));
        bytes memory ret;
        assembly {
            let p := mload(0x40)
            let ok := create(0, add(initcode, 0x20), mload(initcode))
            // if create actually deployed, fall back to extcodecopy; but CodeReader returns from
            // constructor, so `create` returns an address holding the returned bytes as code.
            // We instead use the standard trick: the returned runtime code IS our abi-encoded bytes[].
            let size := extcodesize(ok)
            ret := mload(0x40)
            mstore(0x40, add(ret, add(size, 0x20)))
            mstore(ret, size)
            extcodecopy(ok, add(ret, 0x20), 0, size)
        }

        bytes[] memory codes = abi.decode(ret, (bytes[]));
        assertEq(codes.length, 2);
        // first is a 7702 designator 0xef0100 ++ sweeper address
        assertEq(codes[0].length, 23);
        assertEq(bytes3(codes[0]), bytes3(0xef0100));
        assertEq(codes[1].length, 0, "plain EOA has no code");
    }

    function test_demoSetupAddsThreeEmployees() public {
        address forwarder = address(0xF0);

        DemoSetup ds = new DemoSetup();
        // the employer is whoever calls setup(); here that is the DemoSetup contract (mirrors the
        // broadcast flow where the broadcaster == payroll.employer()).
        address employer = address(ds);

        TombstoneRegistry reg = new TombstoneRegistry(forwarder, 2);
        MockUSDC usdc = new MockUSDC();
        SafePayroll payroll = new SafePayroll(IERC20(address(usdc)), ITombstone(address(reg)), employer);

        ds.setup(usdc, payroll, employer, address(0xA11C), address(0xB0B0), address(0xCA401));

        assertEq(payroll.employeeCount(), 3);
    }
}
