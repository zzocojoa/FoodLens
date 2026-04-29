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
3. 테스트 직전에 안전하게 주입된 렌더 URL
   - `GET /me/profile` 또는 `GET /me/history` 응답에서 획득
   - 문서, 이슈, 로그에 token, secret, signed URL 전체를 기록하지 않는다.

## 1) 렌더 URL 확보 절차
인증값은 셸, CI secret, 또는 비밀 관리 도구에서 먼저 주입한다. 아래 명령은 값을 출력하지 않고 필수 환경변수가 있는지만 확인한다.

```bash
: "${BASE_URL:?set BASE_URL outside this document}"
: "${AUTH_BEARER_TOKEN:?set AUTH_BEARER_TOKEN outside this document}"
```

profile 또는 history 응답에서 signed render URL을 확인한 뒤 `MEDIA_RENDER_URL`로 주입한다. workflow와 동일하게 `/media/render/` 경로와 `exp`, `sig` 쿼리가 있는 URL만 사용한다. `set -x`가 켜진 셸에서는 실행하지 말고, 값을 문서나 로그에 붙여 넣지 않는다.

```bash
profile_render_url="$(
  curl -sS -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" "${BASE_URL%/}/me/profile" \
    | jq -r '.profile.profile_image_render_url // empty' \
    | awk '/\/media\/render\// && /[?&]exp=/ && /[?&]sig=/{print; exit}'
)"

history_render_url="$(
  curl -sS -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" "${BASE_URL%/}/me/history?limit=20" \
    | jq -r '.history[]? | (.entry? // .) | .image_render_url // empty' \
    | awk '/\/media\/render\// && /[?&]exp=/ && /[?&]sig=/{print; exit}'
)"

MEDIA_RENDER_URL="${profile_render_url:-${history_render_url}}"
if [[ -z "${MEDIA_RENDER_URL}" ]]; then
  echo "No signed /media/render URL found in /me/profile or /me/history."
  exit 1
fi
export MEDIA_RENDER_URL
unset profile_render_url history_render_url
```

## 2) 기준선 실행
```bash
cd /Users/beatlefeed/Documents/FoodLens-project

export BASE_URL="https://<RENDER_BASE_URL>"
: "${AUTH_BEARER_TOKEN:?set AUTH_BEARER_TOKEN outside this document}"
: "${MEDIA_RENDER_URL:?set MEDIA_RENDER_URL outside this document}"

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
: "${AUTH_BEARER_TOKEN:?set AUTH_BEARER_TOKEN outside this document}"
: "${MEDIA_RENDER_URL:?set MEDIA_RENDER_URL outside this document}"
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
- GitHub Actions artifact: `backend-media-performance-regression-<run_id>`

`Backend Media Performance Regression` workflow에서 업로드한 artifact는 runner workspace의 `artifacts/perf` 전체를 포함한다. 단일 실행 결과는 보통 `artifacts/perf/backend-media-<run_id>/summary.json`와 `artifacts/perf/backend-media-<run_id>/k6.log`에서 확인한다. fresh URL 해석 diagnostics는 runner workspace의 `artifacts/perf/url-resolution/diagnostics.jsonl`에 기록되고, 업로드된 artifact 안에서는 `url-resolution/diagnostics.jsonl`로 확인할 수 있다. workflow 입력 또는 `PERF_MEDIA_RENDER_URL` secret이 바로 선택된 경우에는 candidate probe를 실행하지 않으므로 diagnostics 파일이 비어 있을 수 있다.

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
3. GitHub secret `PERF_AUTH_BEARER_TOKEN`으로 `/me/profile`, `/me/history?limit=20` 조회
4. `PHASE6_POSTDEPLOY_SMOKE_EMAIL`, `PHASE6_POSTDEPLOY_SMOKE_PASSWORD`로 `/auth/email/login` 후 `/me/profile`, `/me/history?limit=20` 조회

권장 운영 방식은 4번이다. signed render URL은 만료되므로 장기 secret으로 저장하지 않고, 성능 측정 직전에 smoke 계정으로 새 URL을 발급받는다.

필수 GitHub secrets:
- `PHASE6_POSTDEPLOY_SMOKE_EMAIL`
- `PHASE6_POSTDEPLOY_SMOKE_PASSWORD`

선택 GitHub secrets:
- `PERF_AUTH_BEARER_TOKEN`
- `PERF_MEDIA_RENDER_URL`

## 3-3) Backend Media Performance Regression 실패 분류표
| 분류 | 확정 신호 | 의심 신호 | 1차 조치 |
| --- | --- | --- | --- |
| URL resolution 503 | `artifacts/perf/url-resolution/diagnostics.jsonl`에 `candidate_source`가 `profile`, `history`, `history[<index>].image_render_url`, 또는 `profile.profile_image_render_url`인 행의 HTTP `status`가 `503`이고, k6 실행 전 `MEDIA_RENDER_URL` 확정에 실패한다. | workflow 입력 또는 `PERF_MEDIA_RENDER_URL` secret 경로에서는 diagnostics가 비어 있을 수 있어 workflow 로그와 함께 봐야 한다. | 같은 backend base URL의 live readiness와 Render/GCS 상태를 먼저 확인한다. smoke 계정 데이터와 권한은 그 다음에 확인한다. |
| k6 threshold failure | `summary.json`의 `thresholds` 항목 또는 `k6.log`에 threshold 실패가 기록되고, 실행 자체는 `summary.json`를 생성했다. | 특정 지표의 p95 또는 failure rate가 근소하게 초과했지만 외부 장애 로그가 동시에 있다. | `summary.json`의 실제 값과 직전 기준선을 비교한다. threshold 완화는 기본 추천하지 않으며, 서비스 목표가 바뀐 경우에만 별도 승인 후 조정한다. |
| workflow probe parsing bug | candidate probe의 HTTP status와 content type이 정상인데도 URL 선택이 실패하거나, diagnostics의 probe 원시값과 workflow 로그의 판정이 서로 맞지 않는다. | curl은 성공했지만 probe meta의 `status` 또는 `content_type`이 비어 있거나 workflow 로그와 다르다. | workflow의 probe 파싱 로직을 결함 후보로 분리한다. backend 성능 회귀로 확정하지 않는다. |
| smoke data missing | 로그인 또는 인증은 성공했지만 `/me/profile`, `/me/history`에서 signed `/media/render` URL 후보가 없다는 메시지가 기록된다. | profile 이미지는 없고 history도 비어 있거나, history 항목에 이미지 필드가 있지만 signed render URL 형식이 아니다. | smoke 계정에 유효한 이미지 데이터를 다시 준비한다. secret이나 signed URL을 새로 장기 저장하는 방식은 기본 조치로 사용하지 않는다. |
| live readiness failure | URL 해석 전후의 backend 호출이 연결 실패, timeout, `5xx`, readiness 실패로 끝난다. | k6 지표 전체가 나빠졌지만 URL 해석 단계 로그에도 일시적인 `5xx`가 있다. | 배포 상태, readiness endpoint, Render 인스턴스 상태를 먼저 확인한다. 성능 threshold 변경으로 우회하지 않는다. |

## 3-4) diagnostics artifact 판독 기준
diagnostics artifact는 fresh URL 해석 실패 원인을 확정하기 위한 보조 자료다. `artifacts/perf/url-resolution/diagnostics.jsonl`의 각 행은 `timestamp`, `attempt`, `candidate_source`, `status`, `content_type`, `detail.code`, `request_id`, `recovered`를 기록한다. artifact와 workflow 로그의 값은 아래처럼 확정된 사실과 추정 상태를 나누어 기록한다.

- 확정으로 표현할 수 있는 값
  - workflow 로그에 표시된 `MEDIA_RENDER_URL` source. 값 자체는 기록하지 않는다.
  - workflow 로그에 표시된 `AUTH_BEARER_TOKEN` source. 값 자체는 기록하지 않는다.
  - diagnostics의 `candidate_source`가 `profile`, `history`, `profile.profile_image_render_url`, `history[<index>].image_render_url` 중 어디였는지.
  - diagnostics의 HTTP `status`, `content_type`, `detail.code`, `request_id`, `recovered`.
  - `summary.json`에 있는 metric 값과 threshold pass/fail 결과.
  - `k6.log`에 출력된 threshold 실패 메시지.
- 의심됨으로 표현해야 하는 값
  - backend 회귀 여부. `summary.json`의 threshold 실패와 baseline 비교가 함께 확인되기 전에는 의심으로 둔다.
  - signed URL 만료 여부. status code와 만료 관련 응답이 직접 확인되지 않으면 의심으로 둔다.
  - smoke 계정 데이터 누락 여부. 인증 성공 후 profile/history 응답 구조가 확인되기 전에는 의심으로 둔다.
  - workflow probe parsing bug. probe 원시값과 workflow 판정 불일치가 확인되기 전에는 의심으로 둔다.
  - live readiness failure. readiness 또는 배포 상태 확인 전에는 의심으로 둔다.

diagnostics를 공유할 때는 token, secret 값, signed URL 전체를 붙여 넣지 않는다. 필요한 경우 source 이름, status code, content type, artifact 내부 파일 경로, `summary.json` metric 이름만 공유한다.

## 3-5) 주요 metric 이름
비교 스크립트와 threshold 판정에서 추적하는 metric은 아래 이름을 기준으로 한다.

- `http_req_failed.rate`
- `render_failure_rate.rate`
- `render_latency.p(95)`
- `profile_failure_rate.rate`
- `profile_latency.p(95)`
- `analyze_failure_rate.rate`
- `analyze_latency.p(95)`

`run-media-baseline.sh`가 추가로 요약 출력하는 진단용 metric은 아래와 같다. 이 값들은 상태 코드 분포와 content type 불일치를 확인하기 위한 보조 지표이며, 현재 threshold 완화 근거로 단독 사용하지 않는다. `render_content_type_mismatch_rate.rate`는 render 응답이 2xx였지만 `Content-Type`이 `image/*`가 아닌 경우를 센다.

- `http_req_duration.p95`
- `render_status_2xx_rate.rate`
- `render_status_3xx_rate.rate`
- `render_status_4xx_rate.rate`
- `render_status_5xx_rate.rate`
- `render_status_other_rate.rate`
- `render_content_type_mismatch_rate.rate`

`run-media-baseline.sh`의 콘솔 요약은 사람이 읽기 쉬운 별칭으로 latency를 `render_latency.p95`, `profile_latency.p95`, `analyze_latency.p95`처럼 출력한다. `summary.json`, threshold, 비교 스크립트의 필드 이름은 위의 주요 metric 목록처럼 `render_latency.p(95)`, `profile_latency.p(95)`, `analyze_latency.p(95)`를 기준으로 한다.

## 4) 1차 판정 기준 (초기값)
- `http_req_failed.rate < 0.10`
- `render_failure_rate.rate < 0.05`
- `render_latency.p(95) < 1500ms`
- `profile_failure_rate.rate < 0.10`
- `profile_latency.p(95) < 1200ms`
- `analyze_failure_rate.rate < 0.20`
- (옵션) `analyze_latency.p(95) < 2500ms`

## 5) 운영 루틴
1. 배포 전 1회 측정
2. 배포 후 1회 측정
3. `summary.json` 비교 후 개선 여부 판단

## 6) 다음 단계 (스킬화 조건)
아래가 2주 이상 반복되면 스킬화한다.
- 같은 시나리오를 주 2회 이상 반복 실행
- 결과 비교/판정 포맷이 고정됨
- 담당자가 2인 이상으로 늘어남
