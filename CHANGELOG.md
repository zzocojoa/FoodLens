# Changelog

## [0.0.2.0] - 2026-05-30

### Added

- Account deletion now clears session state, app storage, local analysis snapshots, pending sync work, AI caches, barcode caches, and managed FoodLens image files from the device.
- Account switching now clears previous-user in-memory analysis state, pending work, shared local caches, and managed images referenced by the previous user.

### Changed

- Local storage clearing now wipes both MMKV and legacy AsyncStorage data and reports backend-specific failures.
- Managed image cleanup now fails closed when deletion fails instead of letting a deletion flow look successful.

### Fixed

- Analysis deletion no longer hides managed image deletion failures.
- Temporary media upload cleanup failures are now logged and keep the sync operation retryable when cleanup fails after upload.

## [0.0.1.0] - 2026-05-30

### Added

- Google and Kakao mobile sign-in now ties the provider callback to the app-start session with a one-time callback proof.
- Backend login now rejects missing or mismatched callback verifiers before it can issue a session.
- Regression tests now cover valid proof, missing verifier, mismatched verifier, retry after a bad verifier, and ignored client-supplied identity fields.

### Changed

- OAuth API contracts and dry-run smoke checks now document and exercise app proof challenge parameters.
