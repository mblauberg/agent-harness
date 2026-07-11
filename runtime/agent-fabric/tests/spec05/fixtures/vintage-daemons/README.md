# Vintage daemon compatibility fixtures

These immutable Node bundles contain the public-protocol server and protocol
parser built from the named Git commits. The small bundled daemon harness owns
a fixed operator credential and deterministic Attention projections; it logs
initialise metadata and dispatched operations without logging credentials.

- `af548f8.mjs` uses the strict pre-extension parser and genuine legacy result
  codecs from commit `af548f8`.
- `466e5c7.mjs` uses the intermediate required-field codecs from commit
  `466e5c7`, which emit `nativeNotification` without negotiation.

Tests execute each bundle as a separate Unix-socket process and verify its
SHA-256 against `manifest.json`. They do not substitute the current parser or
mock a negotiated offer.
