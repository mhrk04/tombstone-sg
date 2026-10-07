// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {TombstoneRegistry} from "../src/TombstoneRegistry.sol";
import {SafePayroll} from "../src/SafePayroll.sol";
import {TombstoneGuard} from "../src/TombstoneGuard.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SweeperMock} from "../src/SweeperMock.sol";
import {ITombstone} from "../src/ITombstone.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Enum} from "@safe/common/Enum.sol";

// Real Safe v1.4.1
import {Safe} from "@safe/Safe.sol";
import {SafeProxyFactory} from "@safe/proxies/SafeProxyFactory.sol";

contract TombstoneTest is Test {
    TombstoneRegistry reg;
    MockUSDC usdc;
    SafePayroll payroll;

    uint256 constant tanKey = 0xA11CE;
    uint256 constant bobKey = 0xB0B;
    uint256 constant carolKey = 0xCA401;

    address tan = vm.addr(tanKey);
    address bob = vm.addr(bobKey);
    address carol = vm.addr(carolKey);

    address forwarder = address(0xF0);
    address employer = address(0xE1);
    address payable thief = payable(address(0xBAD));

    uint256 constant SAL_TAN = 3_000e6;
    uint256 constant SAL_BOB = 4_000e6;
    uint256 constant SAL_CAROL = 5_000e6;

    function setUp() public virtual {
        reg = new TombstoneRegistry(forwarder, 2);
        usdc = new MockUSDC();
        payroll = new SafePayroll(IERC20(address(usdc)), ITombstone(address(reg)), employer);

        usdc.mint(employer, 1_000_000e6);
        vm.prank(employer);
        usdc.approve(address(payroll), type(uint256).max);

        vm.startPrank(employer);
        payroll.addEmployee(tan, SAL_TAN); // id 0
        payroll.addEmployee(bob, SAL_BOB); // id 1
        payroll.addEmployee(carol, SAL_CAROL); // id 2
        vm.stopPrank();
    }

    // --- helpers ---

    function _obs(address w, uint8 kind, uint32 mask, uint64 t)
        internal
        pure
        returns (TombstoneRegistry.Observation memory)
    {
        return TombstoneRegistry.Observation({
            wallet: w,
            kind: kind,
            chainMask: mask,
            observedAt: t,
            evidence: keccak256(abi.encode(w, kind, t))
        });
    }

    function _report(TombstoneRegistry.Observation[] memory arr) internal {
        vm.prank(forwarder);
        reg.onReport("", abi.encode(arr));
    }

    function _one(TombstoneRegistry.Observation memory o) internal {
        TombstoneRegistry.Observation[] memory arr = new TombstoneRegistry.Observation[](1);
        arr[0] = o;
        _report(arr);
    }

    // --- tests ---

    function test_onlyForwarderCanReport() public {
        TombstoneRegistry.Observation[] memory arr = new TombstoneRegistry.Observation[](1);
        arr[0] = _obs(tan, reg.OBS_TOMBSTONE(), 1, 100);
        vm.expectRevert(); // non-forwarder caller rejected
        reg.onReport("", abi.encode(arr));
    }

    function test_sweeperDelegationActuallySweeps_EIP7702() public {
        SweeperMock sweeper = new SweeperMock(thief);
        Vm.SignedDelegation memory d = vm.signDelegation(address(sweeper), tanKey);
        vm.attachDelegation(d);

        assertEq(tan.code.length, 23, "designator length");
        assertEq(bytes3(tan.code), bytes3(0xef0100), "7702 designator prefix");

        vm.deal(address(this), 0.5 ether);
        (bool ok,) = tan.call{value: 0.5 ether}("");
        assertTrue(ok, "send to delegated tan");

        assertEq(tan.balance, 0, "tan swept to zero");
        assertEq(thief.balance, 0.5 ether, "thief received");
    }

    function test_payrollEscrowsTombstonedAndPaysOthers() public {
        _one(_obs(tan, reg.OBS_TOMBSTONE(), 0x7, 100));

        vm.prank(employer);
        payroll.runPayroll();

        assertEq(payroll.escrowed(0), SAL_TAN, "tan escrowed");
        assertEq(usdc.balanceOf(tan), 0, "tan not paid");
        assertEq(usdc.balanceOf(bob), SAL_BOB, "bob paid");
        assertEq(usdc.balanceOf(carol), SAL_CAROL, "carol paid");
    }

    function test_suspectAlsoEscrows_and_neverDowngradesTombstone() public {
        _one(_obs(tan, reg.OBS_SUSPECT(), 0x1, 100));
        assertTrue(reg.isFlagged(tan), "suspect flagged");

        vm.prank(employer);
        payroll.runPayroll();
        assertEq(payroll.escrowed(0), SAL_TAN, "suspect escrowed");

        // tombstone then suspect must NOT downgrade
        _one(_obs(tan, reg.OBS_TOMBSTONE(), 0x1, 200));
        assertEq(uint8(reg.statusOf(tan)), uint8(TombstoneRegistry.Status.TOMBSTONED));
        _one(_obs(tan, reg.OBS_SUSPECT(), 0x1, 300));
        assertEq(uint8(reg.statusOf(tan)), uint8(TombstoneRegistry.Status.TOMBSTONED), "never downgraded");
    }

    function test_staleReportIgnored() public {
        _one(_obs(tan, reg.OBS_TOMBSTONE(), 0x1, 200));
        // older observation ignored
        _one(_obs(tan, reg.OBS_CLEAN(), 0x0, 100));
        assertEq(uint8(reg.statusOf(tan)), uint8(TombstoneRegistry.Status.TOMBSTONED));
        assertEq(reg.recordOf(tan).lastObservedAt, 200, "stale did not advance clock");
    }

    function test_oldKeyCannotRedirectOrClear() public {
        _one(_obs(tan, reg.OBS_TOMBSTONE(), 0x1, 100));
        // the flagged employee cannot redirect their wallet
        vm.prank(tan);
        vm.expectRevert(abi.encodeWithSelector(SafePayroll.WalletFlagged.selector, tan));
        payroll.changeOwnWallet(0, address(0x1234));
        // and there is no self-clear path: status stays TOMBSTONED
        assertEq(uint8(reg.statusOf(tan)), uint8(TombstoneRegistry.Status.TOMBSTONED));
    }

    function test_selfTombstone() public {
        vm.prank(bob);
        reg.selfTombstone(keccak256("compromised"));
        assertTrue(reg.isTombstoned(bob));
        assertEq(reg.recordOf(bob).cleanStreak, 0);
    }

    function test_releaseRequiresEmployerAttestAndCleanNewWallet() public {
        address tanNew = vm.addr(0x7A2E);
        _one(_obs(tan, reg.OBS_TOMBSTONE(), 0x1, 100));

        vm.prank(employer);
        payroll.runPayroll();
        assertEq(payroll.escrowed(0), SAL_TAN);

        // no pending wallet yet
        vm.expectRevert(SafePayroll.NoPendingWallet.selector);
        payroll.release(0);

        // employer re-attests the new wallet
        vm.prank(employer);
        payroll.reattest(0, tanNew);

        // not scanned clean yet
        vm.expectRevert(abi.encodeWithSelector(SafePayroll.NewWalletNotScannedClean.selector, tanNew));
        payroll.release(0);

        // one CLEAN scan makes it releasable
        _one(_obs(tanNew, reg.OBS_CLEAN(), 0x0, 200));
        payroll.release(0);
        assertEq(usdc.balanceOf(tanNew), SAL_TAN, "released to new wallet");
        assertEq(payroll.escrowed(0), 0);
    }

    function test_clearAfterNCleanScans() public {
        _one(_obs(tan, reg.OBS_SUSPECT(), 0x1, 100));

        // CLEAR with streak < 2 is rejected
        _one(_obs(tan, reg.OBS_CLEAR(), 0x0, 150));
        assertEq(uint8(reg.statusOf(tan)), uint8(TombstoneRegistry.Status.SUSPECT), "clear rejected, still suspect");

        // two CLEAN scans
        _one(_obs(tan, reg.OBS_CLEAN(), 0x0, 200));
        _one(_obs(tan, reg.OBS_CLEAN(), 0x0, 300));
        assertEq(reg.recordOf(tan).cleanStreak, 2);

        // now CLEAR succeeds
        _one(_obs(tan, reg.OBS_CLEAR(), 0x0, 400));
        assertEq(uint8(reg.statusOf(tan)), uint8(TombstoneRegistry.Status.CLEARED));
    }

    // --- real Safe v1.4.1 guard tests ---

    Safe safeSingleton;
    SafeProxyFactory factory;
    TombstoneGuard guard;

    function _deploySafe() internal returns (Safe safe) {
        safeSingleton = new Safe();
        factory = new SafeProxyFactory();
        guard = new TombstoneGuard(ITombstone(address(reg)));

        address[] memory owners = new address[](3);
        owners[0] = tan;
        owners[1] = bob;
        owners[2] = carol;

        bytes memory init = abi.encodeWithSelector(
            Safe.setup.selector,
            owners,
            uint256(2),
            address(0),
            bytes(""),
            address(0),
            address(0),
            uint256(0),
            payable(address(0))
        );
        safe = Safe(payable(address(factory.createProxyWithNonce(address(safeSingleton), init, 0))));

        bytes memory setGuardData = abi.encodeWithSignature("setGuard(address)", address(guard));
        _execAsSafe(safe, address(safe), setGuardData);
    }

    function _execAsSafe(Safe safe, address to, bytes memory data) internal {
        uint256 n = safe.nonce();
        bytes32 txHash =
            safe.getTransactionHash(to, 0, data, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), n);
        bytes memory sigs = _twoSigs(txHash, tanKey, bobKey);
        safe.execTransaction(to, 0, data, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs);
    }

    // Safe requires signatures ordered by ascending signer address.
    function _twoSigs(bytes32 h, uint256 kA, uint256 kB) internal pure returns (bytes memory) {
        address aAddr = vm.addr(kA);
        address bAddr = vm.addr(kB);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(kA, h);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(kB, h);
        if (aAddr < bAddr) {
            return abi.encodePacked(r1, s1, v1, r2, s2, v2);
        }
        return abi.encodePacked(r2, s2, v2, r1, s1, v1);
    }

    function test_safeGuardAllowsCleanSigners() public {
        Safe safe = _deploySafe();
        bytes memory data = abi.encodeWithSignature("setGuard(address)", address(guard));
        _execAsSafe(safe, address(safe), data);
        assertTrue(true, "clean signers allowed");
    }

    function test_safeGuardRejectsTombstonedSigner() public {
        Safe safe = _deploySafe();
        _one(_obs(tan, reg.OBS_TOMBSTONE(), 0x1, 1_000));

        bytes memory data = abi.encodeWithSignature("setGuard(address)", address(guard));
        uint256 n = safe.nonce();
        bytes32 txHash = safe.getTransactionHash(
            address(safe), 0, data, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), n
        );
        bytes memory sigs = _twoSigs(txHash, tanKey, bobKey);

        vm.expectRevert(abi.encodeWithSelector(TombstoneGuard.SignerTombstoned.selector, tan));
        safe.execTransaction(
            address(safe), 0, data, Enum.Operation.Call, 0, 0, 0, address(0), payable(address(0)), sigs
        );
    }
}
