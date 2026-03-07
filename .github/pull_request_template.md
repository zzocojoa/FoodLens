## Summary

- 

## Sync/Auth Safety Checklist (Required)

- [ ] Main direct push not used (`codex/*` branch -> PR flow)
- [ ] Same-account cross-device sync impact reviewed (`profile`, `allergies`, `settings`, `history`, `recent scans`)
- [ ] OAuth identity split risk reviewed (`provider_user_id` / verified email path)
- [ ] Required regression checks executed and result attached

## API Contract Impact

- [ ] No API contract change
- [ ] API contract changed (`backend/contracts/openapi.json` updated)

Label policy:
- If API contract changed, add PR label: `contract-change-approved`

Minimum App Version: 

## Validation

- [ ] Ran backend contract tests
- [ ] Ran frontend contract tests
