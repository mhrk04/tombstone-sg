# Contracts build spec (Prompts 2-4, EXACT)

Working dir: contracts/. Toolchain: forge (solc 0.8.37, evm_version prague, optimizer 200, via_ir OFF).
Libraries already installed in contracts/lib: forge-std, openzeppelin-contracts (v5.1.0), safe-smart-account (v1.4.1).

## foundry.toml
src=src, out=out, test=test, script=script, libs=["lib"], solc_version="0.8.37",
evm_version="prague", optimizer=true, optimizer_runs=200. Comment to keep via_ir OFF (Safe v1.4.1
stack-too-deep under via_ir). Remappings:
  forge-std/=lib/forge-std/src/
  @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
  @safe/=lib/safe-smart-account/contracts/
fs_permissions=[{access="read-write", path="./deployments"}]
rpc_endpoints: sepolia="${SEPOLIA_RPC_URL}", base_sepolia="${BASE_SEPOLIA_RPC_URL}", arbitrum_sepolia="${ARBITRUM_SEPOLIA_RPC_URL}"
[fmt] line_length=140

## src/ files (all MIT, pragma ^0.8.24 unless noted)

### ReceiverTemplate.sol, IReceiver.sol, IERC165.sol
Port from github.com/smartcontractkit/cre-templates (MIT). Keep: constructor(address forwarder),
onReport(bytes metadata, bytes report) gated to the forwarder (reverts for anyone else),
abstract _processReport(bytes calldata report), Ownable-style onlyOwner, getForwarderAddress(),
optional expectedAuthor/workflowId checks. IReceiver is the onReport interface; IERC165 standard.
If network fetch of the exact template is unavailable, implement a faithful equivalent with the same
surface: forwarder stored immutable/settable by owner, onReport reverts "unauthorized" unless
msg.sender==forwarder, then calls _processReport(report). supportsInterface via IERC165.

### ITombstone.sol
interface ITombstone { function isFlagged(address) external view returns (bool);
  function isTombstoned(address) external view returns (bool);
  function isScannedClean(address) external view returns (bool); }

### TombstoneRegistry.sol is ReceiverTemplate, EXACTLY:
- enum Status { NONE, SUSPECT, TOMBSTONED, CLEARED }
- uint8 public constant OBS_CLEAN=0, OBS_SUSPECT=1, OBS_TOMBSTONE=2, OBS_CLEAR=3
- struct Record { Status status; uint8 cleanStreak; uint32 chainMask; uint64 since; uint64 lastObservedAt; bytes32 evidence; }
- struct Observation { address wallet; uint8 kind; uint32 chainMask; uint64 observedAt; bytes32 evidence; }
- mapping(address=>Record) private s_records; uint8 public minCleanScans;
- events StatusChanged(address indexed wallet, Status from, Status to, uint32 chainMask, bytes32 evidence);
  CleanScan(address indexed wallet, uint8 streak);
  StaleObservation(address indexed wallet, uint64 observedAt, uint64 lastObservedAt);
  ClearRejected(address indexed wallet, uint8 streak, uint8 required)
- constructor(address forwarder, uint8 _minCleanScans)
- views: statusOf(address) returns Status; recordOf(address) returns Record;
  isFlagged = SUSPECT||TOMBSTONED; isTombstoned; isScannedClean = lastObservedAt!=0 && !isFlagged && cleanStreak>=1
- selfTombstone(bytes32 evidence): sets msg.sender to TOMBSTONED with mask 0 and resets cleanStreak to 0
- _processReport decodes abi.decode(report,(Observation[])) and calls _apply on each entry:
  if observedAt <= lastObservedAt, emit StaleObservation and return. Otherwise set lastObservedAt.
  CLEAN: cleanStreak++ (saturating at uint8 max), emit CleanScan.
  SUSPECT: cleanStreak=0; set SUSPECT only if status != TOMBSTONED (NEVER DOWNGRADE).
  TOMBSTONE: cleanStreak=0; set TOMBSTONED.
  CLEAR: no-op if NONE or CLEARED; if cleanStreak < minCleanScans emit ClearRejected and return; else set CLEARED with mask 0.
- _set writes status, mask, evidence and since=block.timestamp, emits StatusChanged.
- setMinCleanScans(uint8) onlyOwner.
No function may let the wallet's own key clear its status.

### MockUSDC.sol  (testnet only)
ERC20("Mock USDC","mUSDC"), decimals 6, open mint(address,uint256).

### SweeperMock.sol  (test-only)
{ address payable public immutable thief; constructor(address payable _thief);
  receive() external payable { thief.transfer(msg.value); } }

### CodeReader.sol
constructor(address[] memory wallets) builds bytes[] codes with codes[i]=wallets[i].code,
then assembly return(add(out,0x20), mload(out)) on abi.encode(codes). Deployless reader:
eth_call with data = creationCode ++ abi.encode(address[]) and no `to`.

### SafePayroll.sol  (OZ SafeERC20)
struct Employee { address wallet; uint256 salary; bool active; }
Immutables: IERC20 token; ITombstone registry; address employer.
Employee[] public employees; mapping(uint256=>uint256) public escrowed; mapping(uint256=>address) public pendingWallet.
Events: Paid(uint256 indexed id, address indexed to, uint256 amount);
  Escrowed(uint256 indexed id, address indexed flaggedWallet, uint256 amount);
  Reattested(uint256 indexed id, address indexed oldWallet, address indexed newWallet);
  Released(uint256 indexed id, address indexed to, uint256 amount).
Errors: NotEmployer(); WalletFlagged(address w); NoPendingWallet(); NewWalletNotScannedClean(address w); NotEmployee().
constructor(IERC20 _token, ITombstone _registry, address _employer).
addEmployee(address wallet, uint256 salary) onlyEmployer returns (uint256 id).
changeOwnWallet(uint256 id, address newWallet): caller must be e.wallet. Reverts WalletFlagged if old OR new wallet flagged.
runPayroll() onlyEmployer: for each active employee, safeTransferFrom(employer, this, salary).
  If wallet flagged: escrowed += salary, emit Escrowed. Else transfer and emit Paid.
reattest(uint256 id, address newWallet) onlyEmployer: reverts if newWallet flagged; sets pendingWallet; emits Reattested.
release(uint256 id) anyone: requires pendingWallet (NoPendingWallet) and registry.isScannedClean(to) (NewWalletNotScannedClean).
  Pays escrow to `to`, sets employees[id].wallet=to, clears pending, emits Released.
employeeCount() view.

### TombstoneGuard.sol is BaseGuard (@safe/base/GuardManager.sol, Enum from @safe/common/Enum.sol)
ITombstone public immutable registry. Errors SignerTombstoned(address signer), ExecutorTombstoned(address executor).
checkTransaction(... bytes memory signatures, address msgSender) view:
  revert ExecutorTombstoned if msgSender flagged.
  Recompute txHash with ISafeView(msg.sender).getTransactionHash(..., nonce()-1) (Safe already incremented nonce).
  For each 65-byte signature recover signer the Safe way:
    v==0 -> contract sig (EIP-1271 owner = r); v==1 -> approved hash (owner = r, or msgSender);
    v>30 -> eth_sign (prefix "\x19Ethereum Signed Message:\n32", v-4); else ecrecover.
  Revert SignerTombstoned(signer) if that signer is flagged.
checkAfterExecution no-op.

## test/ (forge-std). Actors: tanKey=0xA11CE, bobKey=0xB0B, carolKey=0xCA401, forwarder=address(0xF0),
employer=address(0xE1), thief=address(0xBAD). registry minCleanScans=2. salaries 3_000e6/4_000e6/5_000e6.
employer minted 1_000_000e6 with approve max.
Helpers: _obs(w,kind,mask,t) uses evidence=keccak256(abi.encode(w,kind,t));
  _report delivers via vm.prank(forwarder) reg.onReport("", abi.encode(arr)).

test/Tombstone.t.sol:
 test_onlyForwarderCanReport
 test_sweeperDelegationActuallySweeps_EIP7702 (vm.signDelegation + vm.attachDelegation; tan.code.length==23,
   bytes3(tan.code)==0xef0100; send 0.5 ether; tan.balance==0, thief.balance==0.5 ether)
 test_payrollEscrowsTombstonedAndPaysOthers (mask 0x7; Tan escrowed 3_000e6, Bob+Carol paid)
 test_suspectAlsoEscrows_and_neverDowngradesTombstone
 test_staleReportIgnored
 test_oldKeyCannotRedirectOrClear
 test_selfTombstone
 test_releaseRequiresEmployerAttestAndCleanNewWallet
 test_clearAfterNCleanScans
 test_safeGuardAllowsCleanSigners
 test_safeGuardRejectsTombstonedSigner (REAL Safe v1.4.1 singleton + SafeProxyFactory, 2-of-3 tan,bob,carol,
   setGuard, sign Tan+Bob, expect revert TombstoneGuard.SignerTombstoned(tan). Keep helpers shallow — via_ir off.)
test/Extras.t.sol: test_codeReaderReturnsEip7702Designators, test_demoSetupAddsThreeEmployees
test/Deploy.t.sol: test_mockForwardersMatchCreDirectory, test_sepoliaGetsFullStack, test_l2TestnetsGetRegistryOnly

## script/ (Prompt 4)
Deploy.s.sol: contract Deploy is Script. SEPOLIA=11155111, BASE_SEPOLIA=84532, ARBITRUM_SEPOLIA=421614.
struct Deployment { uint256 chainId; address forwarder; address registry; address guard; address usdc; address payroll; address sweeper; }
mockForwarder(uint256) pure returns the three MockForwarders (Sepolia 0x15fC6ae953E024d975e77382eEeC56A9101f9F88,
  Base Sepolia 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5, Arb Sepolia 0xD41263567DdfeAd91504199b8c6c87371e83ca5d), else address(0).
run(): forwarder=vm.envOr("FORWARDER", mockForwarder(chainid)); require non-zero "Deploy: unsupported chain; set FORWARDER".
  minClean=vm.envOr("MIN_CLEAN_SCANS", uint256(2)). vm.startBroadcast: broadcaster from vm.readCallers();
  EMPLOYER and THIEF default to broadcaster; d=deploy(...). Then _log and _writeJson to deployments/<chainId>.json
  (keys chainId, forwarder, registry, guard, usdc, payroll, sweeper; addresses only).
deploy(chainId, forwarder, minClean, employer, thief) public, no IO: registry+guard everywhere.
  On SEPOLIA or 31337 also MockUSDC, SafePayroll(usdc, reg, employer), SweeperMock(thief). No manual gas limits.
DemoSetup.s.sol: reads deployments/<chainid>.json (.usdc, .payroll) and env TAN, BOB, CAROL.
  Inside broadcast require broadcaster==payroll.employer() "DemoSetup: broadcast as the payroll employer".
  setup(): mint 1_000_000e6 to employer, approve max, addEmployee Tan 3_000e6, Bob 4_000e6, Carol 5_000e6. Log employeeCount.
deployments/README.md: addresses only.

## ACCEPTANCE (hard gate): `cd contracts && forge build --sizes` green, then `forge test` shows 16/16 passing.
