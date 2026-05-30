# Changelog

## [0.0.1.0] - 2026-05-30

### Added

- Bound Google and Kakao mobile OAuth callbacks to the app-start session with a one-time callback proof.
- Added backend proof validation that rejects missing or mismatched callback verifiers before session issuance.
- Added regression coverage for valid proof, missing verifier, mismatched verifier, retry after a bad verifier, and ignored client-supplied identity fields.

### Changed

- Updated OAuth API contracts and dry-run smoke checks to include app proof challenge parameters.
