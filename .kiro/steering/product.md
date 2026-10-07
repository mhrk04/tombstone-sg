# Product: Tombstone SG, a "Restriction Order" for wallets
TOKEN2049 Origins hackathon. Tracks: Chainlink CRE (main) + NOWNodes Multichain (secondary). Builder: Haziq (@mhrk04). License MIT. Budget $0.

Pitch: Singapore can freeze a scam victim's bank transfers, but nothing stops money flowing into a wallet the scammer already controls. Tombstone is a graduated, on-chain restriction order. A Chainlink CRE workflow scans 8 EVM mainnets (+ Sepolia), via NOWNodes where the key allows and public RPC otherwise, for EIP-7702 sweeper delegations on watched wallets. After DON consensus it writes SUSPECT -> TOMBSTONED -> CLEARED flags to a registry on Sepolia, Base Sepolia and Arbitrum Sepolia. Payroll contracts then ESCROW pay meant for a compromised wallet (they never confiscate it), and a Safe guard rejects signatures from compromised owners.

Problem (cite ONLY these; every number needs its link):
- 2025: 37,308 scam cases, S$913.1M lost; crypto S$182.2M (~20%). SPF Annual Scam and Cybercrime Brief 2025: https://www.police.gov.sg/-/media/SPF/Media-Room/Statistics/Annual-Scams-and-Cybercrime-Brief-2025/Annual-Scam-and-Cybercrime-Brief-2025.pdf
- Victims are asked to "share their login details and seed phrases. This gives scammers full control over the victims' accounts." https://www.scamshield.gov.sg/i-want-protection-from-scams/learn-to-recognise-scams/cryptocurrency-related-scams/
- Government-official impersonation scams rose 123.6% to 3,363 cases (S$242.9M). CNA 25 Feb 2026: https://www.channelnewsasia.com/singapore/scams-ecommerce-government-officials-impersonation-pokemon-trading-cards-police-5947456
- At least S$348M averted through early interventions: https://www.police.gov.sg/Media-Hub/Police-Life/2026/02/Scams-and-Cybercrime-Fell-by-Almost-a-Quarter-in-2025
- The Protection from Scams Act 2025 lets police issue Restriction Orders to banks: https://www.mha.gov.sg/media-room/newsroom/commencement-of-the-protection-from-scams-act/
- 12 ROs by 15 Feb 2026, and 10 of the 12 recipients needed approved withdrawals. "significant system changes are required to allow for graduated restrictions": https://www.mha.gov.sg/media-room/newsroom/restriction-orders-issued-under-protection-from-scams-act-2025/
- That ROs don't reach self-custody wallets is OUR READING of the scope text. Always label it that way.
- >97% of 7702 delegations used one copy-pasted "CrimeEnjoyor" sweeper, and ~79,000 addresses were authorised: https://www.coindesk.com/tech/2025/06/02/post-pectra-upgrade-malicious-ethereum-contracts-are-trying-to-drain-wallets-but-to-no-avail-wintermute
- chainId = 0 authorizations replay across networks: https://arxiv.org/html/2512.12174
- US$83.85M phishing losses across 106,106 victims in 2025: https://drops.scamsniffer.io/scam-sniffer-2025-crypto-phishing-losses-fall-83-to-84-million/
- US$18-37B lost to scams in East and Southeast Asia (2023), UNODC: https://www.unodc.org/roseap/en/2024/10/cyberfraud-industry-expands-southeast-asia/story.html
- WazirX ~US$230M from a Safe: https://techcrunch.com/2024/07/18/indias-wazirx-confirms-security-breach-after-230-million-suspicious-transfer/ . Phemex, 16 chains, >US$85M: https://www.bleepingcomputer.com/news/security/hackers-steal-85-million-worth-of-cryptocurrency-from-phemex/
Gap: victim addresses look clean, so attacker-side screens (verdix-guard, Chainabuse, TRM) pass them. No contract-readable, cross-chain, victim-side "do-not-pay" registry exists.
Persona: Mdm Tan, 62 (fictional). She reads her seed phrase to a fake "MAS officer", and her employer pays her in USDC.
Key finding: sweeper copies embed different thief addresses, so their code hashes differ. Zeroing the PUSH20 operands gives ONE skeleton hash 0x84593f690155fc195163a8fbd37122d36e5877c0f69a98b4dd9c3161d036fc6d that catches the family.
