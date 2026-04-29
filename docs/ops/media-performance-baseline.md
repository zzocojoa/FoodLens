# Media Performance Baseline (Render + GCS)

## 목적
- 대량 트래픽 대응 개선 전에 기준선을 고정한다.
- 이미지 경로 핵심 지표를 비교 가능하게 만든다.

## 범위
- `GET /media/render/{asset_id}`
- `GET /me/profile` (선택, 인증 토큰 있을 때)
- `POST /analyze/label` (선택, `ENABLE_ANALYZE=1`일 때)

## 준비물
1. `k6` 설치
   - macOS: `brew install k6`
2. 테스트 대상 URL
   - 예: `https://<RENDER_BASE_URL>`
3. 서명된 렌더 URL 1개
   - `GET /me/profile` 또는 `GET /me/history` 응답에서 획득

## 1) 렌더 URL 확보 예시
```bash
API="https://<RENDER_BASE_URL>"
TOKEN="<access_token>"

# profile 이미지 렌더 URL
curl -sS -H "Authorization: Bearer ${TOKEN}" "${API}/me/profile" \
  | jq -r '.profile.profile_image_render_url // .profile.profile_image_url'

# history 첫 항목 렌더 URL (profile이 비어 있을 때 대안)
curl -sS -H "Authorization: Bearer ${TOKEN}" "${API}/me/history?limit=1" \
  | jq -r '.history[0].image_render_url // .history[0].imageUri'
```

## 2) 기준선 실행
```bash
cd /Users/beatlefeed/Documents/FoodLens-project

export BASE_URL="https://<RENDER_BASE_URL>"
export AUTH_BEARER_TOKEN="<access_token>"
export MEDIA_RENDER_URL="<signed_render_url>"

# optional
# export ENABLE_ANALYZE=1
# export ANALYZE_PATH="/Users/beatlefeed/Documents/FoodLens-project/label.jpeg"
# export ANALYZE_LOCALE="ko-KR"
# export ANALYZE_ALLERGY="egg"

export K6_VUS=20
export K6_DURATION=60s
export THINK_TIME_MS=200

bash /Users/beatlefeed/Documents/FoodLens-project/scripts/perf/run-media-baseline.sh
```

## 2-1) 매트릭스 실행 (권장)
```bash
cd /Users/beatlefeed/Documents/FoodLens-project

export BASE_URL="https://<RENDER_BASE_URL>"
export AUTH_BEARER_TOKEN="<access_token>"
export MEDIA_RENDER_URL="<signed_render_url>"
export K6_MATRIX_VUS="20 50 100"
export K6_DURATION=60s
export THINK_TIME_MS=200

# scenario A: render + profile
bash /Users/beatlefeed/Documents/FoodLens-project/scripts/perf/run-media-matrix.sh

# scenario B까지 포함하려면:
# export ENABLE_ANALYZE=1
# export ANALYZE_PATH="/Users/beatlefeed/Documents/FoodLens-project/label.jpeg"
# bash /Users/beatlefeed/Documents/FoodLens-project/scripts/perf/run-media-matrix.sh
```

## 3) 결과 위치
- `artifacts/perf/<timestamp>/summary.json`
- `artifacts/perf/<timestamp>/k6.log`
- `artifacts/perf/matrix-<timestamp>/...`

## 3-1) before/after 자동 비교 리포트
```bash
cd /Users/beatlefeed/Documents/FoodLens-project
python3 /Users/beatlefeed/Documents/FoodLens-project/scripts/perf/compare-media-summaries.py \
  --before artifacts/perf/<before>/summary.json \
  --after artifacts/perf/<after>/summary.json
```

CI 게이트에서는 작은 측정 노이즈를 허용하도록 회귀 허용치를 명시한다.
```bash
python3 /Users/beatlefeed/Documents/FoodLens-project/scripts/perf/compare-media-summaries.py \
  --before artifacts/perf/<before>/summary.json \
  --after artifacts/perf/<after>/summary.json \
  --fail-on-regression \
  --max-regression-percent 15 \
  --enforce-thresholds
```

누락된 메트릭은 `n/a`로 표시하며 회귀로 판정하지 않는다. `--enforce-thresholds`를 켜면 현재 k6 임계값을 초과한 after 메트릭에서 실패한다.

## 3-2) GitHub Actions fresh render URL
`Backend Media Performance Regression` workflow는 아래 순서로 `MEDIA_RENDER_URL`을 정한다.

1. `workflow_dispatch` 입력 `media_render_url`
2. GitHub secret `PERF_MEDIA_RENDER_URL`
3. GitHub secret `PERF_AUTH_BEARER_TOKEN`으로 `/me/profile`, `/me/history?limit=1` 조회
4. `PHASE6_POSTDEPLOY_SMOKE_EMAIL`, `PHASE6_POSTDEPLOY_SMOKE_PASSWORD`로 `/auth/email/login` 후 `/me/profile`, `/me/history?limit=1` 조회

권장 운영 방식은 4번이다. signed render URL은 만료되므로 장기 secret으로 저장하지 않고, 성능 측정 직전에 smoke 계정으로 새 URL을 발급받는다.

필수 GitHub secrets:
- `PHASE6_POSTDEPLOY_SMOKE_EMAIL`
- `PHASE6_POSTDEPLOY_SMOKE_PASSWORD`

선택 GitHub secrets:
- `PERF_AUTH_BEARER_TOKEN`
- `PERF_MEDIA_RENDER_URL`

## 4) 1차 판정 기준 (초기값)
- `http_req_failed.rate < 0.10`
- `render_failure_rate.rate < 0.05`
- `render_latency p95 < 1500ms`
- `profile_failure_rate.rate < 0.10`
- `profile_latency p95 < 1200ms`
- `analyze_failure_rate.rate < 0.20`
- (옵션) `analyze_latency p95 < 2500ms`

## 5) 운영 루틴
1. 배포 전 1회 측정
2. 배포 후 1회 측정
3. `summary.json` 비교 후 개선 여부 판단

## 6) 다음 단계 (스킬화 조건)
아래가 2주 이상 반복되면 스킬화한다.
- 같은 시나리오를 주 2회 이상 반복 실행
- 결과 비교/판정 포맷이 고정됨
- 담당자가 2인 이상으로 늘어남
