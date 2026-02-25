# Structure/Logic File Convention

This convention separates data-shape definitions from executable behavior so that modules remain predictable for both humans and AI agents.

## Naming rule

- `*_Structure.ts` / `*_Structure.py`
: Data structure facade. Re-exports shape-oriented symbols (types, interfaces, DTO/schema/dataclass-like structures).
- `*_Logic.ts` / `*_Logic.py`
: Logic facade. Re-exports executable behavior (functions, services, runtime helpers).

## Dependency direction

- `Structure` must not import `Logic`.
- `Logic` can use `Structure` symbols.
- Existing legacy module path remains source-compatible.
: Example: `authApi.ts` stays valid; `authApi_Structure.ts` and `authApi_Logic.ts` are additive facades.

## Why facade-first

A full physical split of every existing file can break routing/build/test paths.
Facade files provide immediate separation points while preserving runtime compatibility.

## Applied scope

- `FoodLens/services/**`
- `FoodLens/features/**/services/**`
- `backend/modules/**`
- `backend/server.py` (facades only)

## Migration guideline

1. New type-only imports should target `*_Structure` first.
2. New runtime imports should target `*_Logic` first.
3. When touching a legacy mixed file, move shape declarations into `*_Structure` and keep behavior in `*_Logic`.
