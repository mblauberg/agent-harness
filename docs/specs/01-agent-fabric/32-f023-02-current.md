
- **AC-038:** current-baseline tests exercise the exact current client/daemon
  schema set: unnegotiated base success, negotiated exact-extension success,
  negotiated-missing-field, unnegotiated-extra-field and malformed-summary
  frames for snapshot, Attention projection-page and view-page. There is no
  downgrade, vintage-daemon fixture, retry-as-older-schema or compatibility
  export. Unknown bounded optional feature names are ignored only at
  initialise; unknown required names are unavailable. Every unknown enum value,
  schema version other than the exact current constant, mixed extension
  presence, duplicate name, 65-combined-entry, 64-plus-64 entry, cross-array
  duplicate, over-64-byte or non-ASCII name fails closed before projection or
  mutation. Current-schema persistence tests prove insert, update and delete
  delivery changes advance global revision exactly as defined, force
  resnapshot for a stale page, and cause a polling Console to observe
  pending-to-terminal state without an unrelated Fabric event while resize and
  resnapshot preserve stable UI state and bounded load. No notification state
  change acknowledges, approves, focuses or otherwise mutates its Attention
  item.
