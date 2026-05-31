# Changelog

## [0.0.5.0] - 2026-05-31

### Added

- Production OAuth login can now return through verified Universal Links/App Links instead of the development-only `foodlens://` custom scheme.
- Release gates now require the production OAuth app-link origin, iOS associated domains, Android verified intent filters, and Render OAuth redirect configuration.
- OAuth app-link rollout documentation now lists the DNS, AASA, assetlinks, provider console, smoke-test, and rollback checks operators need before release.

### Changed

- Mobile Google/Kakao login and provider logout now build HTTPS app-link callbacks when `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL` is configured.
- Backend OAuth start, callback, and login flows now require explicit app return URIs and derive production callbacks from `AUTH_OAUTH_REDIRECT_BASE_URL`.
- OAuth provider smoke checks now exercise HTTPS app-link callbacks and reject production custom-scheme fallback.

### Fixed

- Backend OAuth app redirect validation now rejects cross-provider callback mismatches, such as a Google flow trying to return through the Kakao callback path.

## [0.0.4.0] - 2026-05-31

### Added

- Mobile rollout evidence now records the PR #173 Android EAS production build, Play internal draft submission, Android-only release scope, and remaining gates before broad logout UI availability.

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
