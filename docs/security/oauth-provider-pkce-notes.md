# OAuth Provider PKCE Notes

확인일: 2026-05-25 KST

범위: FoodLens backend OAuth bridge에서 provider authorization URL을 만들고 backend가 token exchange를 수행하는 Google/Kakao 흐름. 이 문서는 공식 provider 문서만 근거로 Kakao PKCE 적용 여부를 결정한다. live provider/API 호출, webhook 호출, credential 검증 요청은 수행하지 않았다.

## 결정

- Google: 현재 bridge에서 S256 PKCE를 적용한다.
- Kakao: 공식 Kakao Developers 문서상 S256 PKCE 지원 신호가 확인되었으므로 bridge에서 S256 PKCE를 적용한다.

## Kakao 근거

- Source: https://developers.kakao.com/docs/latest/en/kakaologin/rest-api
- 확인일: 2026-05-25 KST
- 공식 Kakao Login REST API 문서의 OIDC Discovery 섹션은 `authorization_endpoint`를 `https://kauth.kakao.com/oauth/authorize`, `token_endpoint`를 `https://kauth.kakao.com/oauth/token`로 문서화한다.
- 같은 섹션은 `code_challenge_methods_supported` 값으로 `S256`을 문서화한다. 이는 Kakao authorization code flow가 PKCE S256 적용 대상임을 나타내는 공식 지원 신호다.
- 단, 같은 REST API 문서의 Get authorization code 요청 파라미터 표와 Get token 요청 body 표에는 `code_challenge`와 `code_verifier`가 별도 행으로 노출되어 있지 않다. 따라서 구현 시 Kakao 전용 mock/stub 테스트와 provider별 PKCE 분기를 함께 둔다.

## Kakao 관련 보안 요구

- Source: https://developers.kakao.com/docs/en/getting-started/security-guideline
- 확인일: 2026-05-25 KST
- Kakao 보안 가이드는 authorization code 요청에 unique random `state`를 사용하고 redirect 후 일치 여부를 검증하도록 요구한다.
- OIDC ID token을 쓰는 경우 unique random `nonce`를 보내고 ID token 검증 시 원래 nonce와 비교하도록 안내한다.
- FoodLens 현재 Kakao bridge는 `state`를 서버 pending backend에 저장하고 callback에서는 존재/만료/provider를 검증한다. 저장된 app redirect URI는 allowlist로 다시 확인하고, callback에 `redirect_uri`가 제공되면 pending state의 app redirect URI와도 비교한다. session 발급 직전 POST에서 one-time consume한다.

## 적용 체크리스트

- `backend/server.py`의 Kakao start redirect 생성에서 `pkce_enabled=1`로 설정한다.
- Kakao authorize URL에 `code_challenge`와 `code_challenge_method=S256`이 포함되는지 테스트한다.
- Kakao token exchange 요청 body에 pending state의 `code_verifier`가 포함되는지 실제 provider 호출 없이 mock/stub으로 테스트한다.
- Google과 동일하게 `code_verifier`는 pending state backend에만 저장하고 app deep link, logs, docs 예시에 노출하지 않는다.
- Kakao provider가 stage에서 PKCE 파라미터를 거부하면 `pkce_enabled=0`으로 되돌릴 수 있게 provider별 분기를 유지한다.
- live provider 호출 없이 `/auth/kakao/start` redirect `Location`의 parameter shape만 smoke로 검증한다.

## 계약 영향

- API request/response shape 변경은 없다.
- `backend/contracts/openapi.json` 변경은 필요하지 않다.
- Kakao PKCE 지원 신호는 OIDC Discovery 기준이다. REST API 파라미터 표에는 `code_challenge`와 `code_verifier` 행이 별도로 노출되지 않으므로 staging smoke는 provider redirect를 따라가지 않고 URL parameter shape만 확인한다.
