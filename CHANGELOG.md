# Changelog

## [0.0.1.0] - 2026-05-30

### Added

- Google and Kakao mobile sign-in now ties the provider callback to the app-start session with a one-time callback proof.
- Backend login now rejects missing or mismatched callback verifiers before it can issue a session.
- Regression tests now cover valid proof, missing verifier, mismatched verifier, retry after a bad verifier, and ignored client-supplied identity fields.

### Changed

- OAuth API contracts and dry-run smoke checks now document and exercise app proof challenge parameters.
