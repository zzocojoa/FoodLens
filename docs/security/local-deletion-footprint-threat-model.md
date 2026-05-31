# FoodLens Local Deletion Footprint Threat Model

Date: 2026-05-31
Branch: `codex/local-deletion-footprint-wipe`

## Scope

This model covers local privacy residue after account deletion, data deletion, logout, reinstall, and account switch. It focuses on FoodLens mobile local storage, managed images, offline queues, AI caches, in-memory state, and diagnostic logs. Backend deletion correctness, OAuth provider account state, rooted or jailbroken device compromise, and external photo-library assets are out of scope.

## Assumptions

- The attacker can use an unlocked shared device or a second-hand device after a previous user deleted data, logged out, switched accounts, or reinstalled the app.
- The attacker can observe app-visible screens and may have access to development or diagnostic device logs.
- The attacker cannot bypass OS app sandboxing, extract SecureStore directly, compromise the backend, or force live deletion status to lie.
- App-managed image cleanup only covers `FileSystem.documentDirectory/foodlens_images/`.
- Authenticated Android manual QA was run after live API use was explicitly allowed for this release check.

## Assets

| Asset | Risk | Local control |
| --- | --- | --- |
| Access and refresh tokens | Account takeover if retained locally | `AuthSecureSessionStore.clear()` through session clear |
| Current user/profile snapshot | Cross-user identity and health-adjacent profile leak | `clearSession`, `SafeStorage.clearAll`, legacy profile clear |
| Analysis results | Health-adjacent food/allergy history exposure | `dataStore.clear`, AI cache clear, pending job clear |
| Managed images | Prior food/profile photos visible after wipe | `clearManagedImageDirectory`, `clearManagedImagesForUser` |
| AI/barcode cache | Barcode, allergy context, locale, generated result residue | hashed cache key segments, cache clear, legacy key rejection |
| Sync queue | Offline mutation replay under wrong user | full queue clear on deletion/logout, user-scoped queue clear on account switch |
| In-memory state | Previous user's latest analysis reused in same process | `dataStore.clear`, query cache clear, in-flight barcode clear |
| Device logs | Sensitive metadata visible outside app UI | masked barcode logs, no full AI cache key logging |

## Trust Boundaries

- UI intent to auth/session logic: deletion finalization and logout must not report success until local cleanup resolves.
- Auth/session to SecureStore: tokens leave React state and enter OS-protected storage.
- App logic to SafeStorage: MMKV and AsyncStorage both need clearing because legacy keys can remain after migration.
- App logic to filesystem: managed image deletion must stay inside `foodlens_images/`.
- App logic to logs: request metadata must not include raw barcode, allergy context, tokens, or full cache keys.

## Threats

| ID | Scenario | Current mitigation | Residual risk |
| --- | --- | --- | --- |
| TM-001 | Deletion completes but local wipe partially fails | `clearLocalDeletionFootprint()` delegates to a throwing strong wipe. Account Data screen does not route to login on local clear failure. Android authenticated QA confirmed account deletion and data deletion completion. | Continue release-regression checks on both Android and iOS before store rollout. |
| TM-002 | Logout leaves previous user's local analysis/cache/images | Logout now calls `clearLocalLogoutFootprint()` before routing. Wipe failure logs structured task context, alerts the user, and blocks `/login` navigation. | External photo-library assets remain outside app control. |
| TM-003 | Account A snapshot appears after switching to account B | `persistSession()` clears previous-user local footprint before writing the new session. Tests cover A to B analysis snapshot reuse prevention. | Any auth success path that bypasses `persistSession()` would be a gap and should remain test-audited. |
| TM-004 | MMKV migration leaves AsyncStorage legacy keys | `SafeStorage.clearAll()` clears MMKV and always clears AsyncStorage; failures are thrown. | Uninstall/reinstall behavior remains platform-dependent. |
| TM-005 | Managed image directory deletion fails | Image directory deletion throws, and callers treat the wipe as failed instead of success. | Files outside `foodlens_images/` are intentionally not deleted. |
| TM-006 | Raw barcode/allergy values leak through logs or cache keys | AI cache keys now fingerprint barcode/allergy segments, legacy sensitive AI cache keys are rejected, cache-hit logs expose only key kind, and barcode logs use masking for long and short values. | Historical device logs and old stored cache entries can only be cleared by local wipe or subsequent cache normalization. |
| TM-007 | Offline sync queue replays under the wrong user | Deletion/logout full wipe clears the queue; account switch clears the previous user's queue and runtime caches. | Already-started background promises still need runtime race review in native QA. |

## Manual QA Status

Authenticated Android QA was completed after live API use was allowed for release verification. The user confirmed account switch, logout, data deletion, account deletion, and travel card onboarding behavior as OK. A first scan onboarding clipping issue found during QA was fixed by making that step scrollable and reducing the preview density; the fixed APK was installed on the connected Android device for final visual recheck.

## Verification Focus

- Account deletion/data deletion: verify session, SafeStorage, `dataStore`, pending analysis, AI/barcode cache, sync queue, and `foodlens_images/` are gone before login routing.
- Logout: verify wipe failure blocks navigation and no previous user result/image/profile/history appears while logged out or after login as another account.
- Account switch: verify account B never renders account A's latest analysis snapshot, managed image, pending job, or sync queue item.
- Logs: verify cache hits and barcode cache hits do not emit raw barcode, allergy context, token values, or full AI cache keys.
