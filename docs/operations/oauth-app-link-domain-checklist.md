# OAuth App Link Domain Checklist

이 문서는 운영 OAuth callback을 `foodlens://` custom scheme에서 HTTPS Universal Links/App Links로 전환할 때 필요한 도메인 설정 항목을 정리한다. 실제 `.well-known/apple-app-site-association` 또는 `.well-known/assetlinks.json` 배포 파일은 이 저장소에 만들지 않는다.

## 정책 요약

| 환경 | 앱 return callback | Backend allowlist | 실패 시 동작 |
| --- | --- | --- | --- |
| Local/dev | `foodlens://oauth/google-callback`, `foodlens://oauth/kakao-callback`, `foodlens://oauth/logout-complete` | `AUTH_APP_ALLOWED_REDIRECT_URIS`, `AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS`에 custom scheme을 명시할 때만 허용 | 개발자가 env를 고쳐 재시도 |
| Production | `https://<verified-app-link-domain>/oauth/google-callback`, `https://<verified-app-link-domain>/oauth/kakao-callback`, `https://<verified-app-link-domain>/oauth/logout-complete` | `AUTH_OAUTH_REDIRECT_BASE_URL`에서 HTTPS URI를 파생한다. 명시 allowlist가 필요하면 HTTPS URI만 넣는다 | rollout 중단. `foodlens://` fallback 금지 |

운영에서 App/Universal Links 검증이 실패하면 로그인 완료가 앱으로 돌아오지 않을 수 있다. 이 경우에도 custom scheme을 임시 fallback으로 열지 않는다. 도메인 association, provider console, env 값을 고친 뒤 다시 검증한다.

## 운영 환경 변수

- Mobile:
  - `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL=https://<verified-app-link-domain>`
  - `EXPO_PUBLIC_ANALYSIS_SERVER_URL=https://<backend-domain>`
  - `EXPO_PUBLIC_AUTH_OAUTH_MODE=live`
- Backend:
  - `AUTH_PUBLIC_BASE_URL=https://<backend-domain>`
  - `AUTH_OAUTH_REDIRECT_BASE_URL=https://<verified-app-link-domain>`
  - `AUTH_APP_ALLOWED_REDIRECT_URIS`는 비워두면 `AUTH_OAUTH_REDIRECT_BASE_URL`에서 provider별 HTTPS callback을 파생한다. 명시할 때도 Google 요청은 `/oauth/google-callback`, Kakao 요청은 `/oauth/kakao-callback`만 통과해야 한다.
  - `AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS`는 비워두면 `AUTH_OAUTH_REDIRECT_BASE_URL/oauth/logout-complete`를 파생한다.
- GitHub Actions / EAS:
  - repository variable 또는 secret `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL=https://<verified-app-link-domain>`를 설정한다.
  - Phase1 live provider smoke와 Phase6 postdeploy smoke 실행 시 `oauth_redirect_base_url=https://<verified-app-link-domain>` 입력을 전달한다.

운영에서 custom scheme을 허용하지 않는다. 로컬/dev에서만 `AUTH_APP_ALLOWED_REDIRECT_URIS=foodlens://oauth/google-callback,foodlens://oauth/kakao-callback`와 `AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS=foodlens://oauth/logout-complete`를 명시적으로 설정한다.

## iOS Associated Domains

운영 빌드의 `app.config.js` 결과에 다음 entitlement가 들어가야 한다.

```text
applinks:<verified-app-link-domain>
```

운영자는 Apple Developer App ID와 provisioning profile이 Associated Domains capability를 포함하는지 확인한다. `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL`에 path, port, query, fragment를 넣지 않는다. 예시는 `https://links.foodlens.example.com`처럼 origin만 사용한다.

## OAuth Provider Console

Google/Kakao provider console에는 FoodLens backend callback만 등록한다.

- Google: `https://<backend-domain>/auth/google/callback`
- Kakao: `https://<backend-domain>/auth/kakao/callback`
- Kakao logout redirect를 사용할 때: `https://<backend-domain>/auth/kakao/logout/callback`

Provider console에 등록하지 않는 값:

- `https://<verified-app-link-domain>/oauth/google-callback`
- `https://<verified-app-link-domain>/oauth/kakao-callback`
- `https://<verified-app-link-domain>/oauth/logout-complete`
- `foodlens://oauth/google-callback`
- `foodlens://oauth/kakao-callback`
- `foodlens://oauth/logout-complete`

앱 return URI는 provider console이 아니라 backend allowlist와 앱 Universal/App Links 설정으로 제어한다. Google은 authorized redirect URI가 요청값과 정확히 일치해야 한다. Kakao는 REST API redirect URI와 logout redirect URI를 콘솔에서 별도로 등록한다.

## Apple AASA 필드

운영 도메인의 `https://<verified-app-link-domain>/.well-known/apple-app-site-association`에 다음 형태의 JSON을 배포한다. `Content-Type`은 `application/json`이어야 하며 redirect 없이 200으로 응답해야 한다.

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": [
          "<APPLE_TEAM_ID>.com.hoihou.foodlens"
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
- `appIDs` 값은 `<APPLE_TEAM_ID>.<IOS_BUNDLE_IDENTIFIER>` 형식이다. 운영 기본 bundle id는 `com.hoihou.foodlens`다.
- `components`에는 OAuth app return path만 포함한다.

## Android Asset Links 필드

운영 도메인의 `https://<verified-app-link-domain>/.well-known/assetlinks.json`에 다음 형태의 JSON 배열을 배포한다. `Content-Type`은 `application/json`이어야 하며 redirect 없이 200으로 응답해야 한다.

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
- `assetlinks.json`은 `https://<verified-app-link-domain>/.well-known/assetlinks.json`에서 직접 `200`으로 응답해야 한다.

## 배포 전 확인

- `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL`와 `AUTH_OAUTH_REDIRECT_BASE_URL`는 같은 verified app-link origin이다.
- iOS build config에 `associatedDomains=["applinks:<verified-app-link-domain>"]`가 포함된다.
- Android build config에 `scheme=https`, 같은 host, `pathPrefix=/oauth/`, `autoVerify=true` intent filter가 포함된다.
- backend `AUTH_APP_ALLOWED_REDIRECT_URIS`와 `AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS`가 비어 있거나 HTTPS URI만 포함한다.
- provider console에는 backend callback URI만 등록되어 있고 `foodlens://` custom scheme URI가 운영 앱 항목에 남아 있지 않다.
- live provider 호출 없이 `/auth/{provider}/start`의 `302 Location` host와 query key만 검증한다. provider redirect를 follow하지 않는다.

## 검증 명령

코드/설정 검증:

```bash
cd FoodLens
npx jest --runInBand services/auth/__tests__/oauthProvider.test.ts services/auth/__tests__/providerLogout.test.ts scripts/__tests__/appConfigLinks.test.ts
EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL=https://<verified-app-link-domain> npm run release:env:gate
cd ..
./.venv/bin/python -m unittest \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_oauth_web_bridge_uses_https_redirect_base_url_allowlist \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_oauth_web_bridge_rejects_custom_scheme_without_explicit_allowlist \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_oauth_post_rejects_pending_custom_scheme_without_consuming_state \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_logout_bridge_uses_https_redirect_base_url_allowlist \
  backend.tests.runtime.test_auth_phase1.AuthPhase1RuntimeTests.test_logout_bridge_rejects_custom_scheme_without_explicit_allowlist
AUTH_PROVIDER_SMOKE_MODE=dry-run bash backend/scripts/ci_auth_live_provider_smoke.sh
```

운영 도메인 검증:

```bash
APP_LINK_DOMAIN="<verified-app-link-domain>"
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
