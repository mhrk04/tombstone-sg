// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReceiverTemplate} from "./ReceiverTemplate.sol";
import {ITombstone} from "./ITombstone.sol";

/**
 * @title TombstoneRegistry
 * @notice A graduated, on-chain "restriction order" for wallets. A Chainlink CRE workflow writes
 *         observations (CLEAN / SUSPECT / TOMBSTONE / CLEAR) via the forwarder-gated onReport.
 *         Status is monotonic in severity: once TOMBSTONED a wallet is never silently downgraded by
 *         a SUSPECT observation, and no wallet can clear its own flag with its own key.
 */
contract TombstoneRegistry is ReceiverTemplate, ITombstone {
    enum Status {
        NONE,
        SUSPECT,
        TOMBSTONED,
        CLEARED
    }

    uint8 public constant OBS_CLEAN = 0;
    uint8 public constant OBS_SUSPECT = 1;
    uint8 public constant OBS_TOMBSTONE = 2;
    uint8 public constant OBS_CLEAR = 3;

    struct Record {
        Status status;
        uint8 cleanStreak;
        uint32 chainMask;
        uint64 since;
        uint64 lastObservedAt;
        bytes32 evidence;
    }

    struct Observation {
        address wallet;
        uint8 kind;
        uint32 chainMask;
        uint64 observedAt;
        bytes32 evidence;
    }

    mapping(address => Record) private s_records;
    uint8 public minCleanScans;

    event StatusChanged(address indexed wallet, Status from, Status to, uint32 chainMask, bytes32 evidence);
    event CleanScan(address indexed wallet, uint8 streak);
    event StaleObservation(address indexed wallet, uint64 observedAt, uint64 lastObservedAt);
    event ClearRejected(address indexed wallet, uint8 streak, uint8 required);

    constructor(address forwarder, uint8 _minCleanScans) ReceiverTemplate(forwarder) {
        minCleanScans = _minCleanScans;
    }

    // --- views ---

    function statusOf(address wallet) external view returns (Status) {
        return s_records[wallet].status;
    }

    function recordOf(address wallet) external view returns (Record memory) {
        return s_records[wallet];
    }

    /// @inheritdoc ITombstone
    function isFlagged(address wallet) public view returns (bool) {
        Status s = s_records[wallet].status;
        return s == Status.SUSPECT || s == Status.TOMBSTONED;
    }

    /// @inheritdoc ITombstone
    function isTombstoned(address wallet) public view returns (bool) {
        return s_records[wallet].status == Status.TOMBSTONED;
    }

    /// @inheritdoc ITombstone
    function isScannedClean(address wallet) public view returns (bool) {
        Record storage r = s_records[wallet];
        return r.lastObservedAt != 0 && !isFlagged(wallet) && r.cleanStreak >= 1;
    }

    // --- self action (can only make yourself worse, never clear) ---

    function selfTombstone(bytes32 evidence) external {
        s_records[msg.sender].cleanStreak = 0;
        _set(msg.sender, Status.TOMBSTONED, 0, evidence);
    }

    // --- report processing ---

    function _processReport(bytes calldata report) internal override {
        Observation[] memory obs = abi.decode(report, (Observation[]));
        for (uint256 i = 0; i < obs.length; i++) {
            _apply(obs[i]);
        }
    }

    function _apply(Observation memory o) internal {
        Record storage r = s_records[o.wallet];

        if (o.observedAt <= r.lastObservedAt) {
            emit StaleObservation(o.wallet, o.observedAt, r.lastObservedAt);
            return;
        }
        r.lastObservedAt = o.observedAt;

        if (o.kind == OBS_CLEAN) {
            if (r.cleanStreak < type(uint8).max) {
                r.cleanStreak += 1;
            }
            emit CleanScan(o.wallet, r.cleanStreak);
        } else if (o.kind == OBS_SUSPECT) {
            r.cleanStreak = 0;
            // NEVER DOWNGRADE a tombstone back to suspect.
            if (r.status != Status.TOMBSTONED) {
                _set(o.wallet, Status.SUSPECT, o.chainMask, o.evidence);
            }
        } else if (o.kind == OBS_TOMBSTONE) {
            r.cleanStreak = 0;
            _set(o.wallet, Status.TOMBSTONED, o.chainMask, o.evidence);
        } else if (o.kind == OBS_CLEAR) {
            if (r.status == Status.NONE || r.status == Status.CLEARED) {
                return;
            }
            if (r.cleanStreak < minCleanScans) {
                emit ClearRejected(o.wallet, r.cleanStreak, minCleanScans);
                return;
            }
            _set(o.wallet, Status.CLEARED, 0, o.evidence);
        }
    }

    function _set(address wallet, Status to, uint32 chainMask, bytes32 evidence) internal {
        Record storage r = s_records[wallet];
        Status from = r.status;
        r.status = to;
        r.chainMask = chainMask;
        r.evidence = evidence;
        r.since = uint64(block.timestamp);
        emit StatusChanged(wallet, from, to, chainMask, evidence);
    }

    function setMinCleanScans(uint8 v) external onlyOwner {
        minCleanScans = v;
    }
}
