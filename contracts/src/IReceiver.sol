// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "./IERC165.sol";

/// @notice Interface a CRE report receiver implements. The forwarder calls onReport.
interface IReceiver is IERC165 {
    /// @param metadata opaque CRE metadata (author, workflow id, etc.)
    /// @param report ABI-encoded report payload produced by the workflow
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
