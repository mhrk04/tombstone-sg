// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CodeReader
 * @notice Deployless reader: call eth_call with data = creationCode ++ abi.encode(address[]) and
 *         NO `to`. The constructor gathers each wallet's on-chain code and returns the ABI-encoded
 *         bytes[] directly from constructor return data (never actually deployed).
 */
contract CodeReader {
    constructor(address[] memory wallets) {
        bytes[] memory codes = new bytes[](wallets.length);
        for (uint256 i = 0; i < wallets.length; i++) {
            codes[i] = wallets[i].code;
        }
        bytes memory out = abi.encode(codes);
        assembly {
            return(add(out, 0x20), mload(out))
        }
    }
}
