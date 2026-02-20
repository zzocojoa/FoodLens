#!/usr/bin/env bash
set -euo pipefail

echo "[CI Gate] Running Phase 1 mobile auth smoke suite..."

npm run test -- --runInBand \
  features/auth/login/hooks/__tests__/useLoginScreen.test.ts \
  features/auth/login/hooks/__tests__/useLoginMotion.test.ts \
  features/auth/login/components/__tests__/LoginAuthScreen.test.tsx \
  features/auth/login/components/__tests__/LoginWelcomeScreen.test.tsx \
  features/auth/login/screens/__tests__/LoginScreen.test.tsx \
  services/auth/__tests__/oauthProvider.test.ts \
  services/auth/__tests__/providerLogout.test.ts \
  services/auth/__tests__/sessionManager.test.ts

echo "[CI Gate] Phase 1 mobile auth smoke suite passed."
