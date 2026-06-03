# OAuth App Link Domain Checklist

이 문서는 운영 OAuth callback을 `foodlens://` custom scheme에서 HTTPS Universal Links/App Links로 전환할 때 필요한 도메인 설정 항목을 정리한다. 현재 운영 앱링크 origin은 backend Render URL인 `https://foodlens-2-w1xu.onrender.com`이다. backend가 `.well-known/apple-app-site-association`와 `.well-known/assetlinks.json`을 직접 제공한다. 무료 Apple ID 7일 iOS sideload build만 Associated Domains entitlement 제한 때문에 `com.hoihou.foodlens://oauth/...` 예외를 사용한다.

## 정책 요약

| 환경 | 앱 return callback | Backend allowlist | 실패 시 동작 |
| --- | --- | --- | --- |
| Local/dev | `foodlens://oauth/google-callback`, `foodlens://oauth/kakao-callback`, `foodlens://oauth/logout-complete` | `AUTH_APP_ALLOWED_REDIRECT_URIS`, `AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS`에 custom scheme을 명시할 때만 허용 | 개발자가 env를 고쳐 재시도 |
| iOS free-provisioning sideload | `com.hoihou.foodlens://oauth/google-callback`, `com.hoihou.foodlens://oauth/kakao-callback`, `com.hoihou.foodlens://oauth/logout-complete` | 명시 allowlist가 필요하다. Android/정식 iOS 보호를 위해 HTTPS URI도 함께 유지한다 | 7일 만료를 감수한 실기기 확인 전용. Store/TestFlight에 사용 금지 |
| Production EAS/App Store/TestFlight | `https://foodlens-2-w1xu.onrender.com/oauth/google-callback`, `https://foodlens-2-w1xu.onrender.com/oauth/kakao-callback`, `https://foodlens-2-w1xu.onrender.com/oauth/logout-complete` | `AUTH_OAUTH_REDIRECT_BASE_URL`에서 HTTPS URI를 파생한다. 명시 allowlist가 필요하면 HTTPS URI만 넣는다 | rollout 중단. `foodlens://` fallback 금지 |

정식 운영에서 App/Universal Links 검증이 실패하면 로그인 완료가 앱으로 돌아오지 않을 수 있다. 이 경우에도 custom scheme을 임시 fallback으로 열지 않는다. 도메인 association, provider console, env 값을 고친 뒤 다시 검증한다.

## 운영 환경 변수

- Mobile:
  - `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL=https://foodlens-2-w1xu.onrender.com`
  - `EXPO_PUBLIC_ANALYSIS_SERVER_URL=https://foodlens-2-w1xu.onrender.com`
  - `EXPO_PUBLIC_AUTH_OAUTH_MODE=live`
  - EAS/App Store/TestFlight production build는 `EXPO_PUBLIC_OAUTH_REDIRECT_TRANSPORT`를 비우거나 `app-link`로 둔다. `EXPO_PUBLIC_OAUTH_CUSTOM_REDIRECT_SCHEME`는 설정하지 않는다.
  - 무료 Apple ID 7일 iOS sideload build만 `EXPO_PUBLIC_OAUTH_REDIRECT_TRANSPORT=custom-scheme`, `EXPO_PUBLIC_OAUTH_CUSTOM_REDIRECT_SCHEME=com.hoihou.foodlens`를 설정한다.
  - 앱 config는 Expo Router용 `foodlens` scheme과 sideload callback용 bundle-id scheme `com.hoihou.foodlens`를 모두 등록한다. OAuth sideload callback은 반드시 `com.hoihou.foodlens://oauth/...`를 사용한다.
  - 운영 로그인, provider logout, server URL처럼 release-critical한 `EXPO_PUBLIC_*` 값은 앱 코드에서 `process.env.EXPO_PUBLIC_*` 점 표기로 읽어야 한다. Expo production bundle은 동적 bracket 접근(`process.env['EXPO_PUBLIC_...']`)을 대체하지 않으므로, 운영 빌드에서 값이 빠지면 앱이 provider browser를 열기 전에 `AUTH_PROVIDER_MISCONFIGURED`로 멈춘다.
- Backend:
  - `AUTH_PUBLIC_BASE_URL=https://foodlens-2-w1xu.onrender.com`
  - `AUTH_OAUTH_REDIRECT_BASE_URL=https://foodlens-2-w1xu.onrender.com`
  - `APP_LINK_IOS_APP_IDS=9ZL3RJ73M7.com.hoihou.foodlens`
  - `APP_LINK_ANDROID_PACKAGE_NAME=com.hoihou.foodlens`
  - `APP_LINK_ANDROID_SHA256_CERT_FINGERPRINTS=<ANDROID_RELEASE_CERT_SHA256_FINGERPRINT>`
  - `AUTH_APP_ALLOWED_REDIRECT_URIS`는 비워두면 `AUTH_OAUTH_REDIRECT_BASE_URL`에서 provider별 HTTPS callback을 파생한다. 명시할 때도 Google 요청은 `/oauth/google-callback`, Kakao 요청은 `/oauth/kakao-callback`만 통과해야 한다.
  - `AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS`는 비워두면 `AUTH_OAUTH_REDIRECT_BASE_URL/oauth/logout-complete`를 파생한다.
- GitHub Actions / EAS:
  - repository variable 또는 secret `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL=https://foodlens-2-w1xu.onrender.com`를 설정한다.
  - Phase1 live provider smoke와 Phase6 postdeploy smoke 실행 시 `oauth_redirect_base_url=https://foodlens-2-w1xu.onrender.com` 입력을 전달한다.

정식 운영에서 custom scheme을 허용하지 않는다. 로컬/dev에서만 `AUTH_APP_ALLOWED_REDIRECT_URIS=foodlens://oauth/google-callback,foodlens://oauth/kakao-callback`와 `AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS=foodlens://oauth/logout-complete`를 명시적으로 설정한다. 무료 Apple ID 7일 sideload 확인 중에는 `com.hoihou.foodlens://oauth/google-callback`, `com.hoihou.foodlens://oauth/kakao-callback`, `com.hoihou.foodlens://oauth/logout-complete`를 명시 allowlist에 추가하되, 같은 allowlist에서 HTTPS URI를 제거하지 않는다.

## iOS Associated Domains

운영 빌드의 `app.config.js` 결과에 다음 entitlement가 들어가야 한다.

```text
applinks:foodlens-2-w1xu.onrender.com
```

운영자는 Apple Developer App ID와 provisioning profile이 Associated Domains capability를 포함하는지 확인한다. `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL`에 path, port, query, fragment를 넣지 않는다. 현재 값은 `https://foodlens-2-w1xu.onrender.com`처럼 origin만 사용한다.

## OAuth Provider Console

Google/Kakao provider console에는 FoodLens backend callback만 등록한다.

- Google: `https://foodlens-2-w1xu.onrender.com/auth/google/callback`
- Kakao: `https://foodlens-2-w1xu.onrender.com/auth/kakao/callback`
- Kakao logout redirect를 사용할 때: `https://foodlens-2-w1xu.onrender.com/auth/kakao/logout/callback`

Provider console에 등록하지 않는 값:

- `https://foodlens-2-w1xu.onrender.com/oauth/google-callback`
- `https://foodlens-2-w1xu.onrender.com/oauth/kakao-callback`
- `https://foodlens-2-w1xu.onrender.com/oauth/logout-complete`
- `foodlens://oauth/google-callback`
- `foodlens://oauth/kakao-callback`
- `foodlens://oauth/logout-complete`
- `com.hoihou.foodlens://oauth/google-callback`
- `com.hoihou.foodlens://oauth/kakao-callback`
- `com.hoihou.foodlens://oauth/logout-complete`

앱 return URI는 provider console이 아니라 backend allowlist와 앱 Universal/App Links 설정으로 제어한다. Google은 authorized redirect URI가 요청값과 정확히 일치해야 한다. Kakao는 REST API redirect URI와 logout redirect URI를 콘솔에서 별도로 등록한다.

## Apple AASA 필드

운영 도메인의 `https://foodlens-2-w1xu.onrender.com/.well-known/apple-app-site-association`는 backend가 다음 형태의 JSON으로 응답한다. `Content-Type`은 `application/json`이어야 하며 redirect 없이 200으로 응답해야 한다.

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": [
          "9ZL3RJ73M7.com.hoihou.foodlens"
        ],
        "components": [
          { "/": "/oauth/google-callback" },
          { "/": "/oauth/kakao-callback" },
          { "/": "/oauth/logout-complete" }
        ]
      }
    ]
  }
}
```

필수 확인:

- 파일명은 `apple-app-site-association`이며 확장자가 없다.
- HTTPS 인증서가 유효해야 한다.
- `/.well-known/apple-app-site-association` 요청은 `301` 또는 `302` 없이 `200`으로 응답해야 한다.
- `appIDs` 값은 `<APPLE_TEAM_ID>.<IOS_BUNDLE_IDENTIFIER>` 형식이다. 운영 값은 `9ZL3RJ73M7.com.hoihou.foodlens`다.
- `components`에는 OAuth app return path만 포함한다.

## Android Asset Links 필드

운영 도메인의 `https://foodlens-2-w1xu.onrender.com/.well-known/assetlinks.json`는 backend가 다음 형태의 JSON 배열로 응답한다. `Content-Type`은 `application/json`이어야 하며 redirect 없이 200으로 응답해야 한다.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.hoihou.foodlens",
      "sha256_cert_fingerprints": [
        "<ANDROID_RELEASE_CERT_SHA256_FINGERPRINT>"
      ]
    }
  }
]
```

필수 확인:

- `package_name`은 운영 Android package인 `com.hoihou.foodlens`와 일치해야 한다.
- `sha256_cert_fingerprints`는 release signing certificate fingerprint다. Play App Signing을 쓰는 경우 Play Console의 app signing certificate SHA-256을 사용한다.
- Android build manifest에는 `scheme=https`, 같은 host, `pathPrefix=/oauth/`, `autoVerify=true`, `BROWSABLE`, `DEFAULT`가 포함되어야 한다.
- `assetlinks.json`은 `https://foodlens-2-w1xu.onrender.com/.well-known/assetlinks.json`에서 직접 `200`으로 응답해야 한다.

## 배포 전 확인

- `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL`와 `AUTH_OAUTH_REDIRECT_BASE_URL`는 `https://foodlens-2-w1xu.onrender.com`이다.
- release-critical 모바일 env 접근은 `process.env.EXPO_PUBLIC_*` 점 표기를 사용한다. Jest/dev에서 runtime mutation이 필요한 helper는 허용하지만, 정적 fallback도 함께 있어야 한다.
- iOS build config에 `associatedDomains=["applinks:foodlens-2-w1xu.onrender.com"]`가 포함된다.
- Android build config에 `scheme=https`, 같은 host, `pathPrefix=/oauth/`, `autoVerify=true` intent filter가 포함된다.
- EAS/App Store/TestFlight production 배포 전에는 backend `AUTH_APP_ALLOWED_REDIRECT_URIS`와 `AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS`가 비어 있거나 HTTPS URI만 포함한다.
- provider console에는 backend callback URI만 등록되어 있고 `foodlens://` 또는 `com.hoihou.foodlens://` custom scheme URI가 운영 앱 항목에 남아 있지 않다.
- live provider 호출 없이 `/auth/{provider}/start`의 `302 Location` host와 query key만 검증한다. provider redirect를 follow하지 않는다.
- Android 내부 테스트 build `28` 기준으로 `adb shell dumpsys package com.hoihou.foodlens`는 `versionCode=28`, `adb shell cmd package get-app-links com.hoihou.foodlens`는 `foodlens-2-w1xu.onrender.com: verified`를 보여야 한다.
- 실기기에서 Google/Kakao 로그인을 각각 실행해 provider browser 전환, FoodLens 앱 복귀, 세션 생성까지 확인한다.

## 검증 명령

코드/설정 검증:

```bash
cd FoodLens
npx jest --runInBand services/auth/__tests__/oauthProvider.test.ts services/auth/__tests__/providerLogout.test.ts scripts/__tests__/appConfigLinks.test.ts
EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL=https://foodlens-2-w1xu.onrender.com npm run release:env:gate
rm -rf /tmp/foodlens-export-env-check
EXPO_PUBLIC_ANALYSIS_SERVER_URL=https://foodlens-2-w1xu.onrender.com \
EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL=https://foodlens-2-w1xu.onrender.com \
EXPO_PUBLIC_AUTH_OAUTH_MODE=live \
npx expo export --platform android --output-dir /tmp/foodlens-export-env-check --no-bytecode
rg "foodlens-2-w1xu\\.onrender\\.com/auth/(google|kakao)/start|foodlens-2-w1xu\\.onrender\\.com/oauth/(google|kakao)-callback" /tmp/foodlens-export-env-check/_expo/static/js/android/*.js
cd ..
./.venv/bin/python -m unittest \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_apple_app_site_association_uses_configured_app_ids \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_android_assetlinks_uses_configured_package_and_fingerprints \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_oauth_web_bridge_uses_https_redirect_base_url_allowlist \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_oauth_web_bridge_rejects_custom_scheme_without_explicit_allowlist \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_oauth_post_rejects_pending_custom_scheme_without_consuming_state \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_logout_bridge_uses_https_redirect_base_url_allowlist \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_logout_bridge_rejects_custom_scheme_without_explicit_allowlist
AUTH_PROVIDER_SMOKE_MODE=dry-run bash backend/scripts/ci_auth_live_provider_smoke.sh
```

운영 도메인 검증:

```bash
APP_LINK_DOMAIN="foodlens-2-w1xu.onrender.com"
curl -fsSI "https://${APP_LINK_DOMAIN}/.well-known/apple-app-site-association"
curl -fsS "https://${APP_LINK_DOMAIN}/.well-known/apple-app-site-association"
curl -fsSI "https://${APP_LINK_DOMAIN}/.well-known/assetlinks.json"
curl -fsS "https://${APP_LINK_DOMAIN}/.well-known/assetlinks.json"
```

이 `curl` 검증은 실제 파일 내용과 응답 헤더만 확인한다. OAuth provider redirect를 따라가거나 provider token exchange를 호출하지 않는다.

## 공식 문서

- Apple Associated Domains: https://developer.apple.com/documentation/Xcode/supporting-associated-domains
- Android App Links verification: https://developer.android.com/training/app-links/verify-applinks
- Google OAuth redirect URI rules: https://developers.google.com/identity/protocols/oauth2/web-server
- Kakao Login redirect URI prerequisites: https://developers.kakao.com/docs/en/kakaologin/prerequisite
- Expo environment variables: https://docs.expo.dev/guides/environment-variables/
