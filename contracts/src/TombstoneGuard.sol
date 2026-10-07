// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseGuard} from "@safe/base/GuardManager.sol";
import {Enum} from "@safe/common/Enum.sol";
import {SignatureDecoder} from "@safe/common/SignatureDecoder.sol";
import {ITombstone} from "./ITombstone.sol";

/// @notice Minimal view of the calling Safe needed to recompute the tx hash and read the nonce.
interface ISafeView {
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);

    function nonce() external view returns (uint256);
}

/**
 * @title TombstoneGuard
 * @notice A Safe transaction guard that rejects a transaction if its executor, or any wallet that
 *         signed it, is flagged by the TombstoneRegistry. This is the WazirX / Phemex lesson: a
 *         compromised owner key should not be able to move a Safe's funds.
 */
contract TombstoneGuard is BaseGuard, SignatureDecoder {
    ITombstone public immutable registry;

    error SignerTombstoned(address signer);
    error ExecutorTombstoned(address executor);

    constructor(ITombstone _registry) {
        registry = _registry;
    }

    // solhint-disable-next-line no-unused-vars
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address msgSender
    ) external view override {
        if (registry.isFlagged(msgSender)) revert ExecutorTombstoned(msgSender);

        // The Safe already incremented its nonce before calling the guard, so use nonce()-1.
        bytes32 txHash = ISafeView(msg.sender).getTransactionHash(
            to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, ISafeView(msg.sender).nonce() - 1
        );

        uint256 count = signatures.length / 65;
        for (uint256 i = 0; i < count; i++) {
            address signer = _recoverSigner(txHash, signatures, i, msgSender);
            if (registry.isFlagged(signer)) revert SignerTombstoned(signer);
        }
    }

    function _recoverSigner(bytes32 txHash, bytes memory signatures, uint256 i, address msgSender)
        internal
        pure
        returns (address signer)
    {
        (uint8 v, bytes32 r, bytes32 s) = signatureSplit(signatures, i);
        if (v == 0) {
            // contract signature (EIP-1271): owner encoded in r
            signer = address(uint160(uint256(r)));
        } else if (v == 1) {
            // approved hash: owner encoded in r, or the executor
            signer = address(uint160(uint256(r)));
            if (signer == address(0)) signer = msgSender;
        } else if (v > 30) {
            // eth_sign flow
            signer = ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", txHash)), v - 4, r, s);
        } else {
            signer = ecrecover(txHash, v, r, s);
        }
    }

    function checkAfterExecution(bytes32, bool) external override {}
}
