# Base Module Convention

FoodLens now treats the base file as the only import surface for each module.

## Naming rule

- Use the canonical module file directly.
: Examples: `authApi.ts`, `analysisService.ts`, `backend/modules/auth/service.py`, `backend/server.py`
- Do not add role-suffixed facade files or imports.

## Import rule

- Runtime code, type-only imports, tests, mocks, and scripts should all target the same base module path.
- Re-export wrappers that exist only to mirror another file are not allowed.

## Refactoring rule

- When separating types from behavior, do it inside the canonical module or by introducing a clearly named sibling module with a domain-specific name.
- Prefer names that describe responsibility, not file role.
: Examples: `profileAnalysisLoader.ts`, `analysis/flow.ts`, `media/render_signing.py`

## Applied scope

- `FoodLens/**`
- `backend/**`
- `.github/**`

## Guardrail

- CI must fail if any new role-suffixed facade file or reference is introduced.
