# Structure
contracts/   src/{ITombstone,TombstoneRegistry,ReceiverTemplate,IReceiver,IERC165,SafePayroll,TombstoneGuard,CodeReader,SweeperMock,MockUSDC}.sol
             script/{Deploy,DemoSetup}.s.sol . test/{Tombstone,Extras,Deploy}.t.sol . deployments/<chainId>.json (addresses only)
cre-workflow/ project.yaml . secrets.yaml . scan/{main.ts,workflow.ts,classify.ts,codeReader.ts,workflow.yaml,config.staging.json,config.production.json,workflow.test.ts,scripts/gen-code-reader.ts}
scanner/     src/{classify,chains,rpc,scan,find7702,lists,codeReader,index}.ts . scripts/{scan-mainnets,check-wallets,skeleton,phish-tan}.ts . test/scanner.test.ts
app/         src/{App.tsx,config.ts,registry.ts,demo.ts,main.tsx,style.css} . .env.example
docs/        design.md tasks.md demo-script.md sources.md spike-log.md simulation-output.txt
Root: README.md LICENSE(MIT) Makefile .env.example .gitignore .gitmodules .github/workflows/ci.yml
scanner/src/classify.ts and codeReader.ts are BYTE-IDENTICAL copies of cre-workflow/scan's files, and a test enforces it.
