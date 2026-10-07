// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Read interface consumed by SafePayroll and TombstoneGuard.
interface ITombstone {
    function isFlagged(address wallet) external view returns (bool);
    function isTombstoned(address wallet) external view returns (bool);
    function isScannedClean(address wallet) external view returns (bool);
}
