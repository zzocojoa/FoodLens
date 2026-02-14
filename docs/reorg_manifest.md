# Reorg Manifest (Wide Audit)

Date: 2026-02-13

## Current Standard (2026-02-14)
- Python venv path: `.venv` (repo root)
- Backend dependency file: `backend/requirements.txt`
- Setup script path: `backend/setup.sh`
- Backend run command: `python -m backend.server`
- Canonical Docker build file: `backend/Dockerfile`

## Applied Moves (Batch A)
- business_plan.md -> docs/plans/business_plan.md
- implementation_plan.md -> docs/plans/implementation_plan.md
- ios_project_brief.md -> docs/plans/ios_project_brief.md
- Gemini_Generated_Image_67b87g67b87g67b8.png -> docs/reference-assets/Gemini_Generated_Image_67b87g67b87g67b8.png
- FoodLens/package-lock 2.json -> FoodLens/docs/legacy/package-lock-2.json

## Applied Moves (Batch B)
- server.py -> backend/server.py
- modules/** -> backend/modules/**
- Added root compatibility shim: server.py
- Added root compatibility package: modules/__init__.py

## Applied Moves (Batch C)
- requirements.txt -> backend/requirements.txt
- setup.sh -> backend/setup.sh
- Dockerfile -> backend/Dockerfile
- Added root compatibility wrapper: requirements.txt (historical)
- Added root compatibility wrapper: setup.sh (historical)
- Added root compatibility wrapper: Dockerfile (historical)
- Root compatibility wrappers(`server.py`, `setup.sh`, `requirements.txt`) are removed.
- Root `Dockerfile` is retained for Render default deploy compatibility.

## Keep As-Is (Runtime Stability)
- `backend/server.py`

## Reason
- Runtime entrypoint is fixed to `python -m backend.server`.
- Core runtime files are managed under `backend/`.

## Phase B Candidates (Need import/path migration)
- Normalize duplicate docs under docs/ root vs docs/plans/
- Decide on archived legacy lockfile retention policy

## File Distribution (Tracked Files)
 -    1 .gitignore
 -    1 Dockerfile
 -  335 FoodLens
 -    8 docs
 -   27 modules
 -    1 requirements.txt
 -    1 scripts
 -    1 server.py
 -    1 setup.sh
