import type { Lists } from "./classify";

// Default allow/deny lists. Addresses lowercased. The skeleton hash is the spike finding
// that catches the copy-pasted sweeper family regardless of embedded thief address.
export const DEFAULT_LISTS: Lists = {
  knownGood: [
    "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b",
    "0x000000009b1d0af20d8c6d0a44e162d11f9b8f00",
  ],
  knownSweepers: [
    "0x89383882fc2d0cd4d7952a3267a3b6dae967e704",
    "0xa03fc3c62d26253b3ec3076cb871afa3b5fa60ab",
    "0x08f5e230d412f0cd475b03b9acb51d1562f730f9",
  ],
  sweeperSkeletons: [
    "0x84593f690155fc195163a8fbd37122d36e5877c0f69a98b4dd9c3161d036fc6d",
  ],
};
