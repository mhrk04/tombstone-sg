# Sources

Every figure in this project traces to one of these. No number appears anywhere in the repo without a link here.

## Claims table

| Claim | Source |
|---|---|
| 2025: 37,308 scam cases, S$913.1M lost; crypto S$182.2M (~20%) | [SPF Annual Scam and Cybercrime Brief 2025](https://www.police.gov.sg/-/media/SPF/Media-Room/Statistics/Annual-Scams-and-Cybercrime-Brief-2025/Annual-Scam-and-Cybercrime-Brief-2025.pdf) |
| Victims share "login details and seed phrases… full control" | [ScamShield: cryptocurrency-related scams](https://www.scamshield.gov.sg/i-want-protection-from-scams/learn-to-recognise-scams/cryptocurrency-related-scams/) |
| Gov-official impersonation up 123.6% to 3,363 cases (S$242.9M) | [CNA, 25 Feb 2026](https://www.channelnewsasia.com/singapore/scams-ecommerce-government-officials-impersonation-pokemon-trading-cards-police-5947456) |
| ≥ S$348M averted via early intervention | [SPF Police Life, Feb 2026](https://www.police.gov.sg/Media-Hub/Police-Life/2026/02/Scams-and-Cybercrime-Fell-by-Almost-a-Quarter-in-2025) |
| Protection from Scams Act 2025 → Restriction Orders to banks | [MHA commencement](https://www.mha.gov.sg/media-room/newsroom/commencement-of-the-protection-from-scams-act/) |
| 12 ROs by 15 Feb 2026; 10/12 needed approved withdrawals; "significant system changes… for graduated restrictions" | [MHA ROs issued](https://www.mha.gov.sg/media-room/newsroom/restriction-orders-issued-under-protection-from-scams-act-2025/) |
| >97% of 7702 delegations used one "CrimeEnjoyor" sweeper; ~79,000 addresses authorised | [CoinDesk / Wintermute](https://www.coindesk.com/tech/2025/06/02/post-pectra-upgrade-malicious-ethereum-contracts-are-trying-to-drain-wallets-but-to-no-avail-wintermute) |
| chainId=0 authorizations replay across networks | [arXiv 2512.12174](https://arxiv.org/html/2512.12174) |
| US$83.85M phishing losses, 106,106 victims (2025) | [ScamSniffer 2025](https://drops.scamsniffer.io/scam-sniffer-2025-crypto-phishing-losses-fall-83-to-84-million/) |
| US$18–37B lost to scams in E/SE Asia (2023) | [UNODC](https://www.unodc.org/roseap/en/2024/10/cyberfraud-industry-expands-southeast-asia/story.html) |
| WazirX ~US$230M from a Safe | [TechCrunch](https://techcrunch.com/2024/07/18/indias-wazirx-confirms-security-breach-after-230-million-suspicious-transfer/) |
| Phemex, 16 chains, >US$85M | [BleepingComputer](https://www.bleepingcomputer.com/news/security/hackers-steal-85-million-worth-of-cryptocurrency-from-phemex/) |

## Our reading (labelled, not asserted as fact)
- That Restriction Orders under the Protection from Scams Act 2025 do **not** reach self-custody wallets is **our reading** of the scope text, not an official statement.

## Novelty
No contract-readable, cross-chain, victim-side "do-not-pay" registry exists today. Attacker-side screens
(verdix-guard, Chainabuse, TRM) pass a victim's address because it looks clean — the compromise lives in
the delegation, not the address.

## Technical references
- EIP-7702 delegation designator `0xef0100 ‖ address`: [EIP-7702](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-7702.md)
- Chainlink CRE consumer / forwarder pattern: [docs.chain.link CRE](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)
- CRE MockForwarder directory: [forwarder-directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory)
