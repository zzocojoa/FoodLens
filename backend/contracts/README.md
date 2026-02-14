# Backend API Contract Snapshots

- Canonical OpenAPI snapshot path: `backend/contracts/openapi.json`
- Export command:
  - `python -m backend.scripts.export_openapi --out backend/contracts/openapi.json`

Notes:
- OpenAPI export runs with `OPENAPI_EXPORT_ONLY=1`, so runtime service initialization is skipped.
- In CI, snapshot file is mandatory and always regenerated for drift check.
- In PR CI, label gate for OpenAPI snapshot changes:
  - required label: `contract-change-approved`
  - PR body must include: `Minimum App Version: <version>`

Bootstrap (one-time):
1. Create/activate virtual env and install backend dependencies.
2. Run export command and commit `backend/contracts/openapi.json`.
