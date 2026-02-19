---
name: foodlens-render-blueprint-validation
description: Use when managing FoodLens Render deployment blueprint quality, including render.yaml validation, environment variable consistency checks, and rollback-safe deployment settings.
---

# FoodLens Render Blueprint Validation

Use this skill for Render infrastructure-as-code reliability.

## Scope
- `render.yaml` schema/structure checks.
- Environment variable mapping and deployment safety.

## Workflow
1. Read cloud decision and phase docs for deployment constraints.
2. Validate service definitions, health checks, and start commands.
3. Validate env key parity across stage/prod.
4. Document rollback and restore path for failed deploys.

## DoD
- Blueprint is valid and reproducible.
- Deployment config changes are traceable and rollback-ready.
