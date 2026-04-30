# Media Performance Baseline (Render + GCS)

## 목적
- 대량 트래픽 대응 개선 전에 기준선을 고정한다.
- 이미지 경로 핵심 지표를 비교 가능하게 만든다.

## 범위
- `GET /media/render/{asset_id}`
  - cache-hit latency는 warmed `MEDIA_RENDER_URL` 또는 `MEDIA_RENDER_CACHE_HIT_URL`로 측정한다.
  - cache-miss latency는 선택 입력 `MEDIA_RENDER_CACHE_MISS_URLS` 또는 `MEDIA_RENDER_CACHE_MISS_URLS_PATH`로 분리 측정한다.
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
export RENDER_CACHE_HIT_WARMUP_REQUESTS=1

# optional: cache miss 후보는 서로 다른 cold backend variant여야 한다.
# export MEDIA_RENDER_CACHE_MISS_URLS_PATH="/secure/path/media-render-cache-miss-urls.txt"
# export RENDER_CACHE_MISS_EVERY=1

bash /Users/beatlefeed/Documents/FoodLens-project/scripts/perf/run-media-baseline.sh
```

`MEDIA_RENDER_CACHE_MISS_URLS_PATH`는 newline-delimited signed URL 파일이다. `MEDIA_RENDER_CACHE_MISS_URLS`는 쉼표로 구분한 signed URL 문자열이다. miss 후보는 단순히 `exp`/`sig`만 새로 발급한 같은 variant가 아니라, backend cache key 기준으로 cold인 `asset_id:width:quality:target_format` 조합이어야 한다. 랜덤 query parameter는 backend cache key에 포함되지 않으므로 miss를 만들지 못한다. 스크립트는 `MEDIA_RENDER_URL`, `MEDIA_RENDER_CACHE_HIT_URL`, miss 후보가 모두 `http(s)` signed `/media/render/` URL이고 `exp`, `sig` query parameter를 포함하는지 확인한다. cache-miss 입력을 설정했지만 후보가 비어 있거나, warmed cache-hit URL과 같은 URL이 포함되면 실행하지 않는다.

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

mixed analyze + cold cache-miss 매트릭스는 signed URL 값을 터미널 출력이나 문서에 남기지 않도록 파일 경로로 넘긴다.

```bash
cd /Users/beatlefeed/Documents/FoodLens-project

export BASE_URL="https://<RENDER_BASE_URL>"
: "${AUTH_BEARER_TOKEN:?set AUTH_BEARER_TOKEN outside this document}"
: "${MEDIA_RENDER_URL:?set MEDIA_RENDER_URL outside this document}"
export MEDIA_RENDER_CACHE_MISS_URLS_PATH="/secure/path/media-render-cache-miss-urls.txt"
export RENDER_CACHE_MISS_EVERY=1
export ENABLE_ANALYZE=1
export ANALYZE_PATH="/Users/beatlefeed/Documents/FoodLens-project/label.jpeg"
export ANALYZE_EVERY=10
export K6_MATRIX_VUS="20 50 100"
export K6_DURATION=60s
export THINK_TIME_MS=200

bash /Users/beatlefeed/Documents/FoodLens-project/scripts/perf/run-media-matrix.sh
```

`ENABLE_ANALYZE=1`을 설정한 매트릭스 실행에서 `ANALYZE_PATH`가 없으면 scenario B를 건너뛰지 않고 실패한다. 이 상태는 analyze 혼합 부하를 측정하지 못한 것이므로 통과로 취급하지 않는다.

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
  --min-latency-regression-ms 100 \
  --enforce-thresholds
```

누락된 메트릭은 `n/a`로 표시하며 회귀로 판정하지 않는다. `--enforce-thresholds`를 켜면 현재 k6 임계값을 초과한 after 메트릭에서 실패한다. `--min-latency-regression-ms 100`은 p95 latency가 낮은 기준선에서 수십 ms 노이즈만으로 percent 회귀가 나는 것을 막는다. cache 상태 헤더까지 강제해야 하는 실행에서는 `--require-cache-header`를 함께 사용한다. 이때 `render_cache_disabled_rate.rate`, `render_cache_unknown_rate.rate`는 필수 메트릭으로 취급하므로 누락되어도 실패한다.

`Backend Media Performance Regression` workflow는 PR / `release/**` push / release 이벤트에서 필수 게이트로 실행한다. 비교 기준선은 `baseline_summary_path` 입력 또는 GitHub Actions variable `PERF_BASELINE_SUMMARY_PATH`로 지정한 저장소 내 `summary.json`를 우선 사용한다. 저장소 내 파일이 없으면 `PERF_BASELINE_SUMMARY_ARTIFACT_RUN_ID`와 `PERF_BASELINE_SUMMARY_ARTIFACT_NAME`으로 이전 workflow artifact를 내려받는다. 기준선 경로와 artifact 정보가 모두 없거나, 다운로드 후 `summary.json`를 찾지 못하면 비교를 skip하지 않고 실패한다. 배포 대상 backend가 `X-Media-Render-Cache` 헤더를 내보내는 버전이고 fresh signed render URL이 200 `image/*` 응답을 반환할 때만 `require_cache_header=1`을 사용한다.

secret 없이 workflow/script 배선만 확인해야 할 때는 수동 실행에서 `validate_only=1`을 사용한다. 이 모드는 live backend, signed URL, baseline artifact, k6 설치를 요구하지 않고 `run-media-baseline.sh`와 `compare-media-summaries.py`의 기본 검증 경로만 실행한다. PR / release 기본 실행은 `validate_only=0`이며 실제 성능 게이트를 우회하지 않는다. validate-only 실행도 `backend-media-performance-regression-<run_id>` artifact에 dry-run marker와 synthetic compare summary를 업로드한다.

필수 GitHub variables 또는 secrets:
- `PERF_BACKEND_BASE_URL`
- `PERF_BASELINE_SUMMARY_PATH` 또는 `PERF_BASELINE_SUMMARY_ARTIFACT_RUN_ID` + `PERF_BASELINE_SUMMARY_ARTIFACT_NAME`

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
- `PERF_MEDIA_RENDER_CACHE_HIT_URL`
- `PERF_MEDIA_RENDER_CACHE_MISS_URLS`

## 3-3) Backend Media Performance Regression 실패 분류표
| 분류 | 확정 신호 | 의심 신호 | 1차 조치 |
| --- | --- | --- | --- |
| URL source fetch 503 | `artifacts/perf/url-resolution/diagnostics.jsonl`에 `candidate_source`가 `profile` 또는 `history`인 행의 HTTP `status`가 `503`이고, k6 실행 전 `MEDIA_RENDER_URL` 확정에 실패한다. | workflow 입력 또는 `PERF_MEDIA_RENDER_URL` secret 경로에서는 diagnostics가 비어 있을 수 있어 workflow 로그와 함께 봐야 한다. | 같은 backend base URL의 live readiness, 배포 상태, 인증 상태를 먼저 확인한다. Render/GCS와 smoke 계정 데이터는 그 다음에 확인한다. |
| render candidate probe 503 | `artifacts/perf/url-resolution/diagnostics.jsonl`에 `candidate_source`가 `history[<index>].image_render_url` 또는 `profile.profile_image_render_url`인 행의 HTTP `status`가 `503`이고, k6 실행 전 `MEDIA_RENDER_URL` 확정에 실패한다. | 같은 attempt에서 `profile`과 `history` fetch는 성공했지만 candidate probe만 실패했거나, `recovered`가 `true`인 이전 transient 행이 남아 있다. | `/media/render` 경로, Render/GCS 상태, asset 존재 여부를 먼저 확인한다. smoke 계정 데이터와 권한은 URL 후보 자체가 없을 때 확인한다. |
| k6 threshold failure | `summary.json`의 `thresholds` 항목 또는 `k6.log`에 threshold 실패가 기록되고, 실행 자체는 `summary.json`를 생성했다. | 특정 지표의 p95 또는 failure rate가 근소하게 초과했지만 외부 장애 로그가 동시에 있다. | `summary.json`의 실제 값과 직전 기준선을 비교한다. threshold 완화는 기본 추천하지 않으며, 서비스 목표가 바뀐 경우에만 별도 승인 후 조정한다. |
| cache header unknown 1.0 | `render_cache_unknown_rate.rate`가 `1`이고 동시에 `render_status_2xx_rate.rate`가 `0`이거나 `render_failure_rate.rate`가 높다. | workflow 입력 또는 `PERF_MEDIA_RENDER_URL` secret이 선택된 실행은 fresh URL probe를 건너뛰므로 만료된 signed URL을 계속 사용할 수 있다. | 먼저 `MEDIA_RENDER_URL source`가 workflow input 또는 `PERF_MEDIA_RENDER_URL secret`인지 확인한다. 가능하면 smoke 계정 로그인 경로로 fresh URL을 발급받고, 그 다음 배포 버전의 cache header 지원 여부를 확인한다. |
| workflow probe parsing bug | candidate probe의 HTTP status와 content type이 정상인데도 URL 선택이 실패하거나, diagnostics의 probe 원시값과 workflow 로그의 판정이 서로 맞지 않는다. | curl은 성공했지만 probe meta의 `status` 또는 `content_type`이 비어 있거나 workflow 로그와 다르다. | workflow의 probe 파싱 로직을 결함 후보로 분리한다. backend 성능 회귀로 확정하지 않는다. |
| smoke data missing | 로그인 또는 인증은 성공했지만 `/me/profile`, `/me/history`에서 signed `/media/render` URL 후보가 없다는 메시지가 기록된다. | profile 이미지는 없고 history도 비어 있거나, history 항목에 이미지 필드가 있지만 signed render URL 형식이 아니다. | smoke 계정에 유효한 이미지 데이터를 다시 준비한다. secret이나 signed URL을 새로 장기 저장하는 방식은 기본 조치로 사용하지 않는다. |
| live readiness failure | URL 해석 전후의 backend 호출이 연결 실패, timeout, `5xx`, readiness 실패로 끝난다. | k6 지표 전체가 나빠졌지만 URL 해석 단계 로그에도 일시적인 `5xx`가 있다. | 배포 상태, readiness endpoint, Render 인스턴스 상태를 먼저 확인한다. 성능 threshold 변경으로 우회하지 않는다. |

## 3-4) diagnostics artifact 판독 기준
diagnostics artifact는 fresh URL 해석 실패 원인을 확정하기 위한 보조 자료다. `artifacts/perf/url-resolution/diagnostics.jsonl`의 각 행은 `timestamp`, `attempt`, `candidate_source`, `status`, `content_type`, `detail.code`, `request_id`, `recovered`를 기록한다. artifact와 workflow 로그의 값은 아래처럼 확정된 사실과 추정 상태를 나누어 기록한다.
`candidate_source`가 `profile` 또는 `history`이면 URL 후보를 찾기 위한 JSON endpoint 호출이고, `history[<index>].image_render_url` 또는 `profile.profile_image_render_url`이면 실제 signed render URL 후보 probe다.

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
`profile_*` metric은 `AUTH_BEARER_TOKEN`이 있을 때만 생성되고, `analyze_*` metric은 `ENABLE_ANALYZE=1`일 때만 생성된다. 비활성 시 비교 스크립트와 콘솔 요약은 누락 metric을 `n/a`로 표시하며 회귀로 판정하지 않는다.

- `http_req_failed.rate`
- `render_failure_rate.rate`
- `render_latency.p(95)`
- `render_cache_hit_failure_rate.rate`
- `render_cache_hit_latency.p(95)`
- `render_cache_miss_failure_rate.rate`
- `render_cache_miss_latency.p(95)`
- `profile_failure_rate.rate`
- `profile_latency.p(95)`
- `analyze_failure_rate.rate`
- `analyze_latency.p(95)`

`run-media-baseline.sh`가 추가로 요약 출력하는 진단용 metric은 아래와 같다. 이 값들은 상태 코드 분포와 content type 불일치를 확인하기 위한 보조 지표다. `render_content_type_mismatch_rate.rate`는 render 응답이 2xx였지만 `Content-Type`이 `image/*`가 아닌 경우를 센다. content-type mismatch 관련 rate는 0보다 크면 k6 threshold와 비교 스크립트 threshold에서 실패한다.

- `http_req_duration.p95`
- `render_status_2xx_rate.rate`
- `render_status_3xx_rate.rate`
- `render_status_4xx_rate.rate`
- `render_status_5xx_rate.rate`
- `render_status_other_rate.rate`
- `render_content_type_mismatch_rate.rate`
- `render_cache_hit_content_type_mismatch_rate.rate`
- `render_cache_miss_content_type_mismatch_rate.rate`
- `render_cache_disabled_rate.rate`
- `render_cache_unknown_rate.rate`
- `render_cache_unknown_latency.p(95)`

`run-media-baseline.sh`의 콘솔 요약은 사람이 읽기 쉬운 별칭으로 latency를 `render_latency.p95`, `profile_latency.p95`, `analyze_latency.p95`처럼 출력한다. `summary.json`, threshold, 비교 스크립트의 필드 이름은 위의 주요 metric 목록처럼 `render_latency.p(95)`, `profile_latency.p(95)`, `analyze_latency.p(95)`를 기준으로 한다.

`render_cache_*` metric은 backend 응답 헤더 `X-Media-Render-Cache: hit|miss|disabled`를 기준으로 채워진다. cache가 꺼진 backend는 `X-Media-Render-Cache: disabled`를 반환하며 k6는 이를 `render_cache_disabled_rate`와 `render_cache_unknown_latency`로 분류한다. 배포 대상 backend가 아직 이 헤더를 내보내지 않거나 알 수 없는 값을 내보내면 k6는 `render_cache_unknown_rate`와 `render_cache_unknown_latency`로 분류한다. 헤더 지원 전 배포본에서는 만료된 signed URL, signature 불일치, storage/auth 실패처럼 성공 이미지 응답이 아닌 경로도 header 없이 반환되어 `render_cache_unknown_rate.rate=1`로 보일 수 있다. 현재 backend는 `/media/render` 오류 응답에도 `X-Media-Render-Cache`를 붙이지만, 이 값이 있어도 `render_failure_rate.rate`와 상태 코드 분포가 실패 원인 판정의 우선 근거다. 기본 workflow 실행은 이 값을 진단 지표로 기록하되 render/profile latency와 failure rate를 우선 차단한다. `require_cache_header=1` 또는 비교 스크립트의 `--require-cache-header`를 켠 실행에서는 `render_cache_disabled_rate.rate`와 `render_cache_unknown_rate.rate`가 0보다 크면 실패한다. 이 strict 모드는 cache-hit, cache-disabled, cache-unknown metric을 필수로 요구하며, `MEDIA_RENDER_CACHE_MISS_URLS` 또는 `MEDIA_RENDER_CACHE_MISS_URLS_PATH`를 설정한 실행에서는 cache-miss metric도 필수다.

다운로드한 baseline artifact 안에 이전 비교 기준선이 `baseline/` 하위 디렉터리로 함께 들어 있으면 workflow는 그 중첩 기준선을 후보에서 제외하고 artifact 자체 실행의 `summary.json`을 우선 사용한다. 제외 후에도 `summary.json`이 여러 개 남으면 임의 선택하지 않고 실패한다. 이 경우 `baseline_summary_path` 또는 `PERF_BASELINE_SUMMARY_PATH`를 정확한 파일 경로로 지정한다.

## 4) 1차 판정 기준 (초기값)
- `http_req_failed.rate < 0.10`
- `render_failure_rate.rate < 0.05`
- `render_latency.p(95) < 1500ms`
- (strict cache header) `render_cache_hit_failure_rate.rate < 0.05`
- `render_cache_hit_content_type_mismatch_rate.rate < 0.00001`
- (strict cache header) `render_cache_hit_latency.p(95) < 1500ms`
- (strict cache header + miss URL) `render_cache_miss_failure_rate.rate < 0.05`
- `render_cache_miss_content_type_mismatch_rate.rate < 0.00001`
- (strict cache header + miss URL) `render_cache_miss_latency.p(95) < 2500ms`
- `render_content_type_mismatch_rate.rate < 0.00001`
- (strict cache header) `render_cache_disabled_rate.rate < 0.00001`
- (strict cache header) `render_cache_unknown_rate.rate < 0.00001`
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
