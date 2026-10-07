# Verified @chainlink/cre-sdk 1.23.0 API (probed from installed package)

Entry: import { cre, type Runtime, type NodeRuntime, consensusIdenticalAggregation,
  getNetwork, prepareReportRequest, ok, decodeJson, bytesToHex, TxStatus,
  type CronPayload, type HTTPPayload } from "@chainlink/cre-sdk"
Runner: import { Runner } from "@chainlink/cre-sdk" (also at /sdk/wasm in internal tests)

cre.capabilities: CronCapability, HTTPCapability, HTTPClient, EVMClient, SolanaClient, ConfidentialHTTPClient
cre.handler(trigger, fn, hooks?) -> HandlerEntry
new cre.capabilities.CronCapability().trigger({ schedule }) -> trigger
new cre.capabilities.HTTPCapability().trigger({}) or ({ authorizedKeys: [{type:'KEY_TYPE_ECDSA_EVM', publicKey}] })

Runtime<C>:
  config: C; now(): Date; log(msg)
  runInNodeMode(fn:(nodeRuntime:NodeRuntime<C>, ...args)=>TInput, consensusAggregation, unwrapOptions?)
    -> (...args) => { result(): TOutput }
  report(input: ReportRequest|ReportRequestJson) -> { result(): Report }
  getSecret({id}) -> { result(): Secret }  (Secret has .value; or toJson(SecretSchema, secret))

HTTPClient: new cre.capabilities.HTTPClient()
  .sendRequest(nodeRuntime, { url, method, headers, body }) -> { result(): Response }  // Request body is Uint8Array (bytes); RequestJson body is base64 string
  Response: has statusCode etc; use ok(resp) to check success.

EVMClient: new cre.capabilities.EVMClient(chainSelector: bigint)
  .writeReport(runtime, { receiver, report, gasConfig? }) -> { result(): ... }  // report = signed Report from runtime.report(...).result()
  result has TxStatus (TxStatus.SUCCESS) and tx hash bytes -> bytesToHex(...)

getNetwork({ chainFamily:'evm', chainSelectorName, isTestnet:true }) -> NetworkInfo | undefined
  NetworkInfo.chainSelector.selector : bigint

prepareReportRequest(hexEncodedPayload: Hex, reportEncoder?) -> ReportRequestJson
consensusIdenticalAggregation<T>() -> ConsensusAggregation
decodeJson(bytes: Uint8Array) -> any   (for HTTPPayload.input)
bytesToHex(bytes) -> Hex

Test harness @chainlink/cre-sdk/test:
  newTestRuntime<T>(secrets?, options?, config?) -> TestRuntime<T>  (getLogs(), setTimeProvider())
  addContractMock({address, abi}, evmMock) -> ContractMock (writeReport?: (WriteReportMockInput)=>reply)
  EvmMock, HttpActionsMock (generated), ConsensusMock, registerTestCapability, getTestCapabilityHandler, test

CronPayload: Payload from scheduler/cron trigger_pb (has scheduledExecutionTime.seconds)
HTTPPayload: Payload from networking/http trigger_pb (has .input: Uint8Array)
