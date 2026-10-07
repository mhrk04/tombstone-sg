# deployments/

Each `<chainId>.json` records the deployed contract **addresses only** (chainId, forwarder,
registry, guard, usdc, payroll, sweeper). No private keys, no secrets. These files are written by
`script/Deploy.s.sol` and read by `script/DemoSetup.s.sol`, the CRE workflow config, and the app.
