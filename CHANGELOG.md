# Changelog

## [0.0.3.0] - 2026-05-31

### Fixed

- Logout now preserves the local session when the FoodLens server revoke call fails, so users can retry instead of being routed to a cleared local state.
- Profile logout screens now show retryable server revoke failure alerts with request context.
- Logout no longer treats an incomplete server response as success before local cleanup proceeds.

### Changed

- Provider logout now runs only after FoodLens server revoke and local footprint cleanup succeed, with provider-specific failures reported as warnings.
- Pre-logout sync flush failures are now reported separately from server revoke failures.

## [0.0.2.0] - 2026-05-31

### Added

- Account deletion now clears session state, app storage, local analysis snapshots, pending sync work, AI caches, barcode caches, and managed FoodLens image files from the device.
- Account switching now clears previous-user in-memory analysis state, pending work, shared local caches, and managed images referenced by the previous user.
- Local deletion footprint threat model documents shared-device, reinstall, account switch, offline cache, and log exposure scenarios.

### Changed

- Local storage clearing now wipes both MMKV and legacy AsyncStorage data and reports backend-specific failures.
- Managed image cleanup now fails closed when deletion fails instead of letting a deletion flow look successful.
- Logout now uses the same strong local privacy footprint wipe before routing to the login screen.
- AI and barcode cache keys now avoid raw barcode and allergy context segments.

### Fixed

- Analysis deletion no longer hides managed image deletion failures.
- Travel card and first scan onboarding screens no longer cut off primary actions on smaller Android viewports.
- Temporary media upload cleanup failures are now logged and keep the sync operation retryable when cleanup fails after upload.
- AI cache-hit and barcode cache-hit logs no longer emit full cache keys or raw barcode values.

## [0.0.1.0] - 2026-05-30

### Added

- Google and Kakao mobile sign-in now ties the provider callback to the app-start session with a one-time callback proof.
- Backend login now rejects missing or mismatched callback verifiers before it can issue a session.
- Regression tests now cover valid proof, missing verifier, mismatched verifier, retry after a bad verifier, and ignored client-supplied identity fields.

### Changed

- OAuth API contracts and dry-run smoke checks now document and exercise app proof challenge parameters.
