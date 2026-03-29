# FoodLens P1/P2 Production Support Issues

## [P1] Help Center and Contact Support

- Summary
  - Add a user-facing help center and contact support entry points for production use.
- Problem
  - Users currently have no in-app FAQ or direct support path even though support flows are documented.
- Scope
  - Add FAQ and Contact Support screens.
  - Add support entry points from Profile and Login.
  - Provide a support email composition flow with prefilled context.
- UI Pages
  - `ProfileScreen`
  - `LoginAuthScreen`
  - `SupportFaqScreen`
  - `SupportContactScreen`
- Acceptance Criteria
  - Users can open FAQ from Profile and Login.
  - Users can open Contact Support from Profile and Login.
  - Contact Support opens the mail app with a prefilled subject and body.
  - FAQ supports category filtering and search.
- Out of Scope
  - Ticketing backend
  - Admin dashboard

## [P1] Result Sharing and Incorrect Result Reporting

- Summary
  - Turn the result screen into a usable post-analysis action surface.
- Problem
  - The result screen currently shows a share affordance but users cannot reliably share or report incorrect AI output.
- Scope
  - Wire the share action to the native share sheet.
  - Add an incorrect-result reporting action.
  - Include analysis metadata in the reporting payload.
- UI Pages
  - `ResultScreen`
  - `ResultNavBar`
- Acceptance Criteria
  - Share opens the native share sheet.
  - Report opens the user’s mail app with request, model, prompt, and history metadata.
  - Actions are localized.
- Out of Scope
  - Structured feedback backend
  - Moderation workflow

## [P2] Account Management Extensions

- Summary
  - Improve self-service account management after initial launch stabilization.
- Problem
  - Auth exists, but users cannot manage active sessions, login methods, or account details beyond deletion.
- Scope
  - Add active sessions/device management.
  - Add revoke-other-sessions action.
  - Add login method visibility and account detail editing hooks.
- UI Pages
  - `ProfileScreen`
  - `Account Sessions Screen`
- Acceptance Criteria
  - Users can inspect active sessions.
  - Users can revoke other sessions.
  - Users can see the current login method.
- Out of Scope
  - Billing
  - Subscription management

## [P2] Traveler Card and Shareable Deep Links

- Summary
  - Improve traveler-facing sharing and re-entry flows.
- Problem
  - Traveler-facing artifacts exist, but they are not easy to share or re-open through user-facing links.
- Scope
  - Add Traveler Card share action.
  - Add user-facing deep links for support and result entry points.
- UI Pages
  - `TravelerAllergyCard`
  - `ResultScreen`
  - `SupportFaqScreen`
- Acceptance Criteria
  - Users can share the traveler card from the card surface.
  - Result and support links can be opened through app routes.
- Out of Scope
  - Public web landing pages
  - Referral campaigns
