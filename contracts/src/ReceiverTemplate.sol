// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReceiver} from "./IReceiver.sol";
import {IERC165} from "./IERC165.sol";

/**
 * @title ReceiverTemplate
 * @notice Base contract for a CRE report consumer. A Chainlink CRE workflow produces a signed
 *         report that is delivered by the KeystoneForwarder (the `forwarder`). Only the forwarder
 *         may call `onReport`; it decodes nothing itself and hands the raw report to the concrete
 *         `_processReport` implementation.
 * @dev Faithful equivalent of the smartcontractkit/cre-templates ReceiverTemplate surface
 *      (the upstream file could not be fetched during this build; the public interface — forwarder
 *      gating, abstract _processReport, onlyOwner, getForwarderAddress, optional author/workflow
 *      checks, ERC-165 — matches the documented CRE receiver pattern).
 */
abstract contract ReceiverTemplate is IReceiver {
    /// @notice The KeystoneForwarder allowed to deliver reports.
    address private s_forwarder;

    /// @notice Contract owner (Ownable-style).
    address public owner;

    /// @notice Optional expected report author (zero = unchecked).
    address public expectedAuthor;

    /// @notice Optional expected workflow id (zero = unchecked).
    bytes10 public expectedWorkflowId;

    error OnlyForwarder();
    error OnlyOwner();
    error UnexpectedAuthor(address author);
    error UnexpectedWorkflow(bytes10 workflowId);

    event ForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyForwarder() {
        if (msg.sender != s_forwarder) revert OnlyForwarder();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address forwarder) {
        s_forwarder = forwarder;
        owner = msg.sender;
        emit ForwarderUpdated(address(0), forwarder);
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external onlyForwarder {
        _checkMetadata(metadata);
        _processReport(report);
    }

    /// @notice Concrete receivers decode and act on the report here.
    function _processReport(bytes calldata report) internal virtual;

    /// @dev Enforces optional author / workflow-id checks when configured.
    ///      CRE metadata layout: bytes32 workflowId (first 10 bytes used) ... address author.
    function _checkMetadata(bytes calldata metadata) internal view {
        if (expectedWorkflowId != bytes10(0) || expectedAuthor != address(0)) {
            if (metadata.length >= 10) {
                bytes10 wfId = bytes10(metadata[0:10]);
                if (expectedWorkflowId != bytes10(0) && wfId != expectedWorkflowId) {
                    revert UnexpectedWorkflow(wfId);
                }
            }
            if (expectedAuthor != address(0) && metadata.length >= 32) {
                address author = address(uint160(uint256(bytes32(metadata[metadata.length - 32:]))));
                if (author != expectedAuthor) revert UnexpectedAuthor(author);
            }
        }
    }

    function getForwarderAddress() external view returns (address) {
        return s_forwarder;
    }

    function setForwarder(address forwarder) external onlyOwner {
        emit ForwarderUpdated(s_forwarder, forwarder);
        s_forwarder = forwarder;
    }

    function setExpectedAuthor(address author) external onlyOwner {
        expectedAuthor = author;
    }

    function setExpectedWorkflowId(bytes10 workflowId) external onlyOwner {
        expectedWorkflowId = workflowId;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external view virtual returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
