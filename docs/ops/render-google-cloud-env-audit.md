# Render Google Cloud 환경변수 사용 지점 조사

작성일: 2026-05-02

범위는 Render 서비스 `foodlens-api`, `foodlens-worker`, `foodlens-retention-cron`과 저장소 코드 기준이다. 실제 Render Dashboard의 secret 값은 확인하지 않았고, 이 문서는 env key 이름과 코드 경로만 다룬다. 단가는 코드에 하드코딩하지 않고 GCP Billing/공식 가격표 확인 대상으로 둔다.

관련 문서:

- AI 모델 비용/라우팅 설계: `docs/ops/ai-model-cost-comparison.md` (`codex/ai-model-cost-analysis` 병합 후 같은 경로에서 참조)
- Release gate 운영 문서: `docs/roadmap/phase-6-release-gate-execution.md`
- Render blueprint gate: `backend/scripts/ci_render_blueprint_gate.sh`

## 1. 결론

현재 GCP 청구와 가장 직접 연결되는 경로는 Vertex AI/Gemini와 GCS 미디어 저장소다. 특히 `GEMINI_LABEL_MODEL_NAME`이 Render Dashboard에 없거나 빈 값이면 `backend/modules/analyst_runtime/food_analyst.py:121` 기본값 때문에 `/analyze/label`이 `gemini-2.5-pro`를 사용한다. `/analyze/label`은 추출 1회와 알러지 판정 1회의 2-pass 구조라 요청 1건이 Gemini 호출 2건으로 이어질 수 있다.

저장소의 `render.yaml`에는 `GCP_PROJECT_ID`, `GCP_SERVICE_ACCOUNT_JSON`, `MEDIA_GCS_BUCKET`, `MEDIA_GCS_PREFIX`, `MEDIA_RENDER_*`, `GEMINI_RETRY_TIMEOUT_SECONDS`, `GEMINI_RETRY_MAX_ATTEMPTS`가 세 서비스에 공통 배치되어 있다. 반면 `GCP_LOCATION`, `GEMINI_MODEL_NAME`, `GEMINI_LABEL_MODEL_NAME`, `GEMINI_MAX_CONCURRENT_SLOTS`, `GEMINI_RETRY_INITIAL_SECONDS`, `GEMINI_RETRY_MAX_SECONDS`, `GEMINI_RETRY_MULTIPLIER`, `GEMINI_429_*`, `GOOGLE_API_KEY`는 `render.yaml`에 없다. Render Dashboard에 별도로 들어가 있는지 확인해야 한다.

`DATAGO_API_KEY`, `DATAGO_I2790_API_KEY`, `KOREAN_FDA_API_KEY`는 GCP 비용이 아니라 외부 공공 API/쿼터 항목이다. 모바일의 `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`는 Render env가 아니라 EAS/build env 쪽이며 Android 지도 렌더링 비용 또는 Maps API 사용량으로 이어질 수 있다.

## 2. Render 서비스별 Google Cloud env var

| service | env key | 저장소 기준 | sync:false | 사용 코드 파일:라인 | GCP 서비스/SKU 후보 |
| --- | --- | --- | --- | --- | --- |
| `foodlens-api` | `GCP_PROJECT_ID` | required for Vertex AI | yes, `render.yaml:97` | `backend/modules/analyst_runtime/food_analyst.py:156`, `:197` | Vertex AI / Gemini Predictions |
| `foodlens-api` | `GCP_LOCATION` | optional, 코드 기본값 `us-central1`; `render.yaml` 없음 | Dashboard 확인 | `backend/modules/analyst_runtime/food_analyst.py:157`, `:197` | Vertex AI region |
| `foodlens-api` | `GCP_SERVICE_ACCOUNT_JSON` | required for Vertex AI/GCS on Render | yes, `render.yaml:99` | Vertex temp credential: `backend/modules/analyst_runtime/food_analyst.py:158`, `:166-180`; GCS client: `backend/modules/media/service.py:322`, `:164-172` | Vertex AI auth, Cloud Storage auth |
| `foodlens-api` | `GOOGLE_API_KEY` | 저장소 runtime 사용처 없음 | Dashboard 확인 | `rg` 기준 backend runtime 사용처 없음 | 현재 코드 기준 직접 SKU 없음 |
| `foodlens-api` | `GEMINI_MODEL_NAME` | optional, 코드 기본값 `gemini-2.0-flash`; `render.yaml` 없음 | Dashboard 확인 | `backend/modules/analyst_runtime/food_analyst.py:120`, `:130` | Vertex AI / Gemini food image/text predictions |
| `foodlens-api` | `GEMINI_LABEL_MODEL_NAME` | optional이지만 비용상 중요; 없으면 `gemini-2.5-pro` | Dashboard 확인 | `backend/modules/analyst_runtime/food_analyst.py:121`, `:391-392` | Vertex AI / Gemini label OCR + allergen assess predictions, Pro thinking output 가능 |
| `foodlens-api` | `GEMINI_MAX_CONCURRENT_SLOTS` | optional, 코드 기본값 `3`; `render.yaml` 없음 | Dashboard 확인 | `backend/modules/analyst_runtime/generation.py:37`, `:49-50` | Vertex AI 동시 호출량 제어 |
| `foodlens-api` | `GEMINI_RETRY_TIMEOUT_SECONDS` | optional guard | no, `render.yaml:81-82` | `backend/modules/analyst_runtime/generation.py:41`, `:101-110` | 재시도로 인한 Vertex AI 추가 호출 가능성 제어 |
| `foodlens-api` | `GEMINI_RETRY_MAX_ATTEMPTS` | optional guard | no, `render.yaml:83-84` | `backend/modules/analyst_runtime/generation.py:42`, `:85-100` | 재시도로 인한 Vertex AI 추가 호출 가능성 제어 |
| `foodlens-api` | `GEMINI_RETRY_INITIAL_SECONDS`, `GEMINI_RETRY_MAX_SECONDS`, `GEMINI_RETRY_MULTIPLIER` | optional, 코드 기본값 사용; `render.yaml` 없음 | Dashboard 확인 | `backend/modules/analyst_runtime/generation.py:38-40`, `:70-72` | Vertex AI retry/backoff 동작 |
| `foodlens-api` | `GEMINI_429_BACKOFF_INITIAL_SECONDS`, `GEMINI_429_BACKOFF_MULTIPLIER`, `GEMINI_429_COOLDOWN_SECONDS`, `GEMINI_429_COOLDOWN_MIN_CONSECUTIVE` | optional, 코드 기본값 사용; `render.yaml` 없음 | Dashboard 확인 | `backend/modules/analyst_runtime/generation.py:43-46`, `:132-170`, `:186-205` | 429 회피, fallback 모델 전환 |
| `foodlens-api` | `MEDIA_STORAGE_BACKEND` | required for GCS media path, value `gcs` | no, `render.yaml:105-106` | `backend/modules/media/service.py:307-309`, readiness `backend/server.py:719-729` | Cloud Storage |
| `foodlens-api` | `MEDIA_GCS_BUCKET` | required for enabled GCS media path | yes, `render.yaml:107-108` | `backend/modules/media/service.py:311-313`, `:175` | Cloud Storage bucket storage/read/write/delete |
| `foodlens-api` | `MEDIA_GCS_PREFIX` | optional object prefix, value `media` | no, `render.yaml:109-110` | `backend/modules/media/service.py:145-150`, `:315` | Cloud Storage object namespace |
| `foodlens-api` | `MEDIA_RENDER_*` | render URL/cache/quality/concurrency config | mixed, signing secret is sync:false at `render.yaml:113-114`; others visible `render.yaml:115-138` | init `backend/server.py:372-404`; render path `backend/server.py:3661-3847` | GCS read/egress, Render CPU, derivative cache behavior |
| `foodlens-worker` | same keys as `foodlens-api` | same env block for worker | same pattern, `render.yaml:339-395` for Gemini/GCS/media | worker imports same runtime services through `backend/worker_main.py` and `backend/server.py` initialization paths | Vertex AI jobs, GCS media if used by worker |
| `foodlens-retention-cron` | same keys as `foodlens-api` | same env block for cron | same pattern, `render.yaml:597-653` for Gemini/GCS/media | retention/deletion paths `backend/server.py:496-547`, `:2240-2317`; GCS delete `backend/modules/media/service.py:345-383` | GCS delete/readiness; Vertex keys present but normally not needed for cleanup |

## 3. 비용 발생 경로

### Vertex AI / Gemini

- `/analyze`: `backend/server.py:4300-4355`에서 이미지를 읽고 `analyst.analyze_food_json`을 호출한다. 실제 모델은 `GEMINI_MODEL_NAME` 또는 기본 `gemini-2.0-flash`이고, `backend/modules/analyst_runtime/food_analyst.py:245-288`에서 이미지+프롬프트를 Vertex AI `generate_content`로 보낸다. max token finish reason이면 max output token을 키워 한 번 더 호출할 수 있다.
- `/analyze/label`: `backend/server.py:4357-4583`에서 품질 게이트와 비용 guardrail 후 `analyst.analyze_label_json`을 호출한다. `backend/modules/analyst_runtime/food_analyst.py:388-401`이 OCR extract 1회, `:416-432`가 allergen assess 1회 호출이다. `GEMINI_LABEL_MODEL_NAME`이 없으면 `:121` 기본값 때문에 `gemini-2.5-pro`가 사용된다. 현재 청구 원인인 Gemini 2.5 Pro Thinking Text Output은 이 경로와 가장 직접적으로 맞물린다.
- `/analyze/smart`: `backend/server.py:4585-4649`에서 `SmartRouter`로 라우팅한다. 라우터 자체는 `backend/modules/analyst_runtime/router.py:27-29`에서 고정 `gemini-2.0-flash`를 만들고 `:69-73`에서 분류 1회를 호출한다. 이후 라벨이면 `:90-95`로 `/analyze/label`과 같은 Pro 기본값 경로에 들어갈 수 있다.
- `/lookup/barcode`: `backend/server.py:4651-4809`에서 공공 API와 OpenFoodFacts를 조회한 뒤, 성분이 있고 `allergy_info != None`이면 `:4734-4752`에서 `analyst.analyze_barcode_ingredients`를 호출한다. 이 함수는 `backend/modules/analyst_runtime/food_analyst.py:582-643`에서 텍스트-only Gemini 호출을 수행하고, 모델은 `GEMINI_MODEL_NAME` 계열이다. 알러지가 없거나 성분이 없으면 `:604-620`에서 Gemini 호출을 건너뛴다.
- `/analyze/jobs`: `backend/server.py:4175-4262`에서 큐에 넣고, worker가 같은 분석 runtime을 사용한다. `foodlens-worker`의 `ANALYSIS_JOB_WORKER_COUNT=1`은 `render.yaml:317-318`에 설정되어 있어 배경 작업도 Vertex AI 비용을 만들 수 있다.

### GCS storage/read/write/delete/egress

- `/me/media/upload`: `backend/server.py:3349-3427`에서 `media_storage.upload_original`을 호출한다. GCS 구현은 `backend/modules/media/service.py:201-280`이고 `blob.upload_from_string(..., if_generation_match=0)`이 write/storage 비용 후보다.
- `/media/render/{asset_id}`: `backend/server.py:3661-3847`에서 signed URL을 검증하고, cache miss면 `backend/server.py:3738-3775`에서 DB asset lookup, GCS `fetch_original`, PIL/WebP 변환을 수행한다. GCS fetch는 `backend/modules/media/service.py:282-306`의 `blob.download_as_bytes`다. 응답은 backend가 내려주므로 외부 사용자에게 전송되는 payload는 Render egress와 GCS-to-Render read/egress 정책을 함께 확인해야 한다.
- retention cleanup: `backend/server.py:496-522`가 retention job을 구성하고, `backend/server.py:2240-2317`이 retention record를 지우면서 `media_storage.delete_original`을 호출한다. GCS delete 구현은 `backend/modules/media/service.py:345-383`이다.
- deletion queue: `backend/server.py:527-547`가 deletion queue consumer를 만들고, `backend/modules/ops/privacy_deletion.py:130-154`이 사용자 media assets를 순회해 GCS object와 DB asset record를 삭제한다.

### Google Maps

- Render env가 아니라 mobile build env다. `FoodLens/app.config.js:27-28`이 `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`를 읽고, `:86-91`에서 Android `googleMaps.apiKey`에 넣는다.
- 런타임에서는 `FoodLens/features/history/screens/HistoryScreen.tsx:198-200`이 Android에서 키 존재 여부를 보고 native map 사용 가능 여부를 결정한다. 실제 map component는 `FoodLens/components/HistoryMap.tsx:53-72`의 `react-native-maps`다.
- GCP Billing에서는 Maps SDK for Android 또는 관련 Maps SKU를 확인한다. 키 제한은 Android app package/SHA-1 또는 SHA-256 지문 기준으로 걸어야 한다.

### 기타 Google 관련 항목

- Google OAuth는 `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`로 Google OAuth endpoint를 호출하지만, 일반적으로 Vertex/GCS 같은 GCP billing SKU와는 별도다. 코드 경로는 `backend/server.py:1665-1737`이다.
- Google Mobile Ads/AdMob은 GCP 비용이 아니라 광고 플랫폼 수익/SDK 설정 영역이다. `FoodLens/app.config.js:112-119`, `FoodLens/services/ads/googleAdsConfig.ts:17-40`에서 env를 읽는다.
- `DATAGO_API_KEY`, `DATAGO_I2790_API_KEY`, `KOREAN_FDA_API_KEY`는 `render.yaml:205-210`, `:463-468`, `:721-726`에 있지만 GCP 비용이 아니다. Data.go.kr/FoodSafetyKorea/Public Data Portal 쿼터와 인증 실패/429 관리 대상이다. 코드 근거는 `backend/modules/barcode/clients/datago_client.py:33-35`, `:206-228`, `backend/modules/barcode/clients/public_data_client.py:27-52`, `:111-200`이다.

## 4. 현재 방어장치

- API rate limit: `render.yaml:25-40`, `:283-298`, `:541-556`에 endpoint별 분당 제한이 있고, 구현은 `backend/modules/ops/api_edge_guard.py:81-101`이다.
- inflight guard: `render.yaml:41-54`, `:299-312`, `:557-570`에 endpoint별 동시 실행 제한이 있고, 구현은 `backend/modules/ops/api_edge_guard.py:104-122`이다.
- Gemini 동시 호출 guard: `backend/modules/analyst_runtime/generation.py:37-50`에서 `GEMINI_MAX_CONCURRENT_SLOTS` 기반 semaphore를 만든다. 단, 이 key는 `render.yaml`에 없어 Dashboard 값 확인이 필요하다.
- Gemini retry/backoff: 일반 retry는 `backend/modules/analyst_runtime/generation.py:75-114`, 라벨 429 backoff는 `:132-170`, 429 cooldown/fallback은 `:186-205`다. `render.yaml`에는 timeout/max attempts만 있다.
- 라벨 비용 guardrail: `backend/server.py:557-569`에서 월 예산 service를 만들고, `/analyze/label`에서 `backend/server.py:3882-3903`이 warn/degrade/fallback을 판단하며, 성공 후 `:3984-3992`가 사용량을 기록한다. 현재 storage는 `InMemoryMonthlyUsageStorage`라 프로세스 재시작/다중 인스턴스에는 누적성이 없다.
- 라벨 품질 gate: `backend/server.py:3819-3857`에서 품질이 낮은 이미지를 Gemini 호출 전에 차단한다.
- media render cache/singleflight/concurrency: init은 `backend/server.py:392-404`, cache get/set은 `:1076-1128`, singleflight는 `:1182-1201`, cold miss limiter는 `:1154-1171`, stage header는 `:1053-1062`, 실제 render 응답 header는 `:3811-3820`다. 운영 문서도 `docs/ops/media-performance-baseline.md:299-306`에서 `MEDIA_RENDER_WEBP_METHOD`, `MEDIA_RENDER_MAX_CONCURRENT_MISSES`, 5 VU/20 VU gate 정책을 설명한다.
- barcode upstream cache/retry: `backend/modules/barcode/service.py:33-39`, `:60-90`이 file cache이고, Data.go.kr retry/cooldown은 `backend/modules/barcode/clients/datago_client.py:35-68`, `:135-204`, Public Data retry/auth cooldown은 `backend/modules/barcode/clients/public_data_client.py:30-52`, `:141-200`이다.
- retention TTL: `render.yaml:229-240`, `:487-499`, `:745-758`에 원본/derived/log TTL이 있고, runtime 구성은 `backend/server.py:491-522`다.

## 5. 누락된 통제와 확인 필요 항목

- `GEMINI_LABEL_MODEL_NAME`이 `render.yaml`에 없다. Render Dashboard에서 `foodlens-api`와 `foodlens-worker`에 실제 값이 있는지 확인해야 한다. 없거나 빈 값이면 `gemini-2.5-pro` 기본값이 적용된다.
- `GCP_LOCATION`이 `render.yaml`에 없다. 코드 기본값은 `us-central1`이다. Billing/Vertex AI quota를 보는 region과 일치하는지 확인해야 한다.
- `GEMINI_MAX_CONCURRENT_SLOTS`와 `GEMINI_429_*`가 `render.yaml`에 없다. 운영에서 비용/429 방어를 더 예측 가능하게 만들려면 Dashboard에 명시하는 편이 좋다.
- label cost guardrail은 인메모리라 Render 재시작, web/worker 분리, 다중 인스턴스에서 월 누적 비용을 보장하지 못한다. Postgres 기반 비용 집계가 필요하다.
- `GCP_SERVICE_ACCOUNT_JSON`은 Vertex AI와 GCS를 모두 쓰는 broad key일 수 있다. service account 권한을 최소화하고, 가능하면 media와 Vertex 역할을 분리해야 한다.
- GCS bucket lifecycle policy는 저장소 코드에서 확인되지 않았다. Console에서 original/derived TTL과 bucket lifecycle이 일치하는지 확인해야 한다.
- GCS delete는 현재 코드 기준 generation precondition을 적용한다. 신규 upload는 `if_generation_match=0`와 저장된 `object_generation`을 사용하고, legacy asset은 삭제 직전 generation 조회 후 `blob.delete(if_generation_match=...)`로 삭제한다. 별도 audit/reconciliation 운영 리포트는 여전히 후속 확인 대상이다.
- Maps API key restriction은 저장소만으로 확인할 수 없다. Google Cloud Console의 Credentials에서 Android package/SHA 지문 제한, API 제한이 걸려 있는지 확인해야 한다.
- Render Dashboard의 `GOOGLE_API_KEY`는 현재 backend runtime에서 직접 사용되지 않는다. 남아 있다면 사용처를 재확인하고 불필요한 key는 제거 후보로 둔다.

## 6. Render Dashboard에서 바로 확인할 항목

세 서비스별로 Render Dashboard > service > Environment에서 아래를 확인한다. 값은 문서나 로그에 복사하지 않는다.

1. `foodlens-api`
   - `GCP_PROJECT_ID`: GCP Billing 프로젝트와 같은지.
   - `GCP_LOCATION`: 없으면 코드 기본 `us-central1` 사용. 의도한 region인지.
   - `GCP_SERVICE_ACCOUNT_JSON`: 존재 여부, service account email, key rotation date.
   - `GEMINI_MODEL_NAME`: 음식 분석과 barcode allergen 텍스트 분석 모델.
   - `GEMINI_LABEL_MODEL_NAME`: 반드시 확인. 없거나 빈 값이면 `gemini-2.5-pro`.
   - `GEMINI_MAX_CONCURRENT_SLOTS`, `GEMINI_RETRY_*`, `GEMINI_429_*`: Dashboard에 명시되어 있는지.
   - `MEDIA_STORAGE_BACKEND`, `MEDIA_GCS_BUCKET`, `MEDIA_GCS_PREFIX`, `MEDIA_RENDER_*`: GCS bucket과 render cache/quality/concurrency 설정.
   - autoDeploy와 최근 deploy 이력: env 변경 뒤 실제 서비스가 재시작/배포되었는지.

2. `foodlens-worker`
   - `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`.
   - `GEMINI_MODEL_NAME`, `GEMINI_LABEL_MODEL_NAME`: async job이 라벨/음식 분석을 수행하므로 api와 동일 정책인지.
   - `ANALYSIS_JOB_WORKER_COUNT`: `render.yaml:317-318` 기준 worker는 1, api/cron은 0.
   - `MEDIA_*`: worker가 media asset을 처리하는 job을 맡는 경우 api와 동일해야 한다.

3. `foodlens-retention-cron`
   - `MEDIA_STORAGE_BACKEND`, `MEDIA_GCS_BUCKET`, `MEDIA_GCS_PREFIX`, `GCP_SERVICE_ACCOUNT_JSON`: cleanup/delete가 GCS에 접근할 수 있는지.
   - `GEMINI_*`: cron에는 보통 불필요하다. Render env block에 남아 있어도 실제 cleanup 경로에서는 쓰지 않는지 점검한다.
   - `RETENTION_*`, `DELETION_*`: cleanup/delete 정책과 interval.

## 7. GCP Console에서 바로 확인할 항목

- Billing Reports: filter `Service = Vertex AI`; SKU에서 `Gemini 2.5 Pro Thinking Text Output - Predictions` 또는 유사 항목을 확인한다. 시간대를 `/analyze/label` 호출 로그와 맞춘다.
- Vertex AI Usage/Quotas: project=`GCP_PROJECT_ID`, region=`GCP_LOCATION` 또는 코드 기본 `us-central1`. Gemini 2.5 Pro, Flash, Flash Lite quota와 429 발생 여부를 본다.
- IAM service account permissions: Render의 `GCP_SERVICE_ACCOUNT_JSON`에 들어간 service account가 Vertex AI 호출, GCS object read/write/delete에 필요한 최소 권한만 갖는지 확인한다.
- Cloud Storage bucket metrics: `MEDIA_GCS_BUCKET`의 object count, storage bytes, GET/read, PUT/write, DELETE, egress를 본다.
- Cloud Storage lifecycle: `MEDIA_GCS_PREFIX` 아래 original/derived 객체에 lifecycle rule이 있는지, 앱의 `RETENTION_ORIGINAL_TTL_DAYS=30`, `RETENTION_DERIVED_TTL_DAYS=90`와 충돌하지 않는지 확인한다.
- Google Maps API key restrictions: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`가 Android package name과 SHA fingerprint, 필요한 API로 제한되어 있는지 확인한다.
- Budget alerts: Vertex AI와 Cloud Storage 비용에 월 예산 알림이 있는지 확인한다. 앱 내부 `$10` guardrail은 현재 라벨 추정치용이고 GCP Billing 전체 budget을 대체하지 못한다.

## 8. Release gate / Render blueprint 연결

Release gate 문서 `docs/roadmap/phase-6-release-gate-execution.md`는 필수 게이트에 타입 검사, 계약 테스트, 자동 회귀, mobile performance, backend media performance, post-deploy smoke를 포함한다. 비용 통제는 여기에 다음 readiness 항목으로 붙인다.

- AI env readiness: `GEMINI_LABEL_MODEL_NAME`, `GEMINI_MODEL_NAME`, `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON` 존재 여부와 의도한 값 확인.
- Budget readiness: GCP Budget alert 존재, Vertex AI quota 확인, `LABEL_COST_GUARDRAIL_ENABLED=1`, `LABEL_MONTHLY_BUDGET_USD`, `LABEL_ESTIMATED_*` 검토.
- Pro fallback policy: Pro가 기본 경로인지 fallback-only인지 Go/No-Go 회의에 명시.
- Dashboard drift: `render.yaml`에는 없지만 코드가 읽는 `GCP_LOCATION`, `GEMINI_MODEL_NAME`, `GEMINI_LABEL_MODEL_NAME`, `GEMINI_MAX_CONCURRENT_SLOTS`, `GEMINI_429_*`를 Render Dashboard checklist로 유지.

Render blueprint gate `backend/scripts/ci_render_blueprint_gate.sh`는 현재 `GEMINI_RETRY_TIMEOUT_SECONDS`, `GEMINI_RETRY_MAX_ATTEMPTS`, `GCP_PROJECT_ID`, `GCP_SERVICE_ACCOUNT_JSON`, `MEDIA_*`, `DATAGO_*`, retention/deletion env를 필수 key로 본다. 비용 통제 구현 브랜치에서는 이 gate에 AI 모델 env drift report를 추가하는 것이 좋다. 단, `GEMINI_LABEL_MODEL_NAME`을 blueprint 필수값으로 넣을지는 운영 정책 결정이 필요하다. Render Dashboard secret으로 관리할 경우에는 “blueprint에 없음, Dashboard에서 확인 필수”로 gate summary에 남긴다.

## 9. 우선순위

1. Render Dashboard에서 `GEMINI_LABEL_MODEL_NAME` 확인 및 Pro 기본값 제거 여부 결정.
2. `foodlens-api`와 `foodlens-worker`의 `GCP_PROJECT_ID`, `GCP_LOCATION`, Billing project 일치 확인.
3. GCP Billing에서 `Gemini 2.5 Pro Thinking Text Output - Predictions` 시간대와 `/analyze/label` 로그의 `used_model` 매칭.
4. label cost guardrail을 Postgres 집계로 옮길지 결정. 현재 인메모리는 운영 예산 차단으로는 약하다.
5. service account 최소 권한, Maps key restriction, GCS lifecycle policy를 Console에서 확인.

## 10. 후속 구현 브랜치 후보

- `codex/ai-cost-guardrail-postgres`: provider/model/route별 비용 사용량을 Postgres에 기록하고 월 예산 guardrail을 모든 AI route로 확장.
- `codex/label-model-routing-flags`: label extract/assess 모델 분리, `max_output_tokens`, Pro fallback-only 조건, golden set gate 추가.
- `codex/render-ai-env-readiness-gate`: Render blueprint gate 또는 별도 CI에서 AI env drift/readiness summary를 artifact로 생성.
- `codex/gcp-budget-ops-runbook`: GCP Budget alert, Vertex AI quota, IAM 최소 권한, Maps key restriction, GCS lifecycle 확인 절차 문서화.
