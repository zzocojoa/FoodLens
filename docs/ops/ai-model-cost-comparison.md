# FoodLens AI 모델 비용 비교

확인일: 2026-05-02

공식 가격 출처:

- OpenAI API pricing: https://developers.openai.com/api/docs/pricing
- OpenAI 이미지 입력 토큰 계산: https://developers.openai.com/api/docs/guides/images-vision
- Google Agent Platform / Vertex Gemini pricing: https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing
- Render/GCP env 사용 지점 감사: `docs/ops/render-google-cloud-env-audit.md` (`codex/gcp-render-env-audit-clean` 병합 후 같은 경로에서 참조)

가격 정보는 앱 코드에 하드코딩하지 않는다. 이 문서는 운영 의사결정을 위한 현재 시점의 가격 스냅샷이며, 실제 과금 계산은 공식 가격표를 다시 확인한 별도 설정값 또는 가격 카탈로그에서 다룬다.

## 1. Gemini 2.5 Pro 비용이 발생하는 코드 경로

현재 Gemini 2.5 Pro 비용의 핵심 원인은 라벨 분석 경로다.

- `backend/modules/analyst_runtime/food_analyst.py:257`에서 음식 이미지 분석과 바코드 성분 알러지 분석 모델을 `GEMINI_MODEL_NAME`으로 정한다. 기본값은 `gemini-2.0-flash`다.
- `backend/modules/analyst_runtime/food_analyst.py:167-179`와 `:258-260`에서 라벨 분석 기본 모델은 `GEMINI_LABEL_PRIMARY_MODEL_NAME` 또는 기존 호환용 `GEMINI_LABEL_MODEL_NAME`으로 정한다. 둘 다 비어 있으면 `gemini-2.5-flash`를 사용한다.
- `GEMINI_LABEL_MODEL_NAME=gemini-2.5-pro`처럼 Pro가 기본 모델로 들어와도 `GEMINI_LABEL_ALLOW_PRO_PRIMARY=1`이 없으면 `gemini-2.5-flash`로 내려간다.
- Pro는 `backend/modules/analyst_runtime/food_analyst.py:656-663`, `:702-720` 기준 `GEMINI_LABEL_PRO_FALLBACK_ENABLED=1`이고 fallback 모델명이 Pro일 때만 `GEMINI_LABEL_FALLBACK_MODEL_NAME` 경로로 시도된다.
- `backend/modules/analyst_runtime/food_analyst.py:528-545`가 라벨 이미지 OCR 추출 호출이다. 이때 선택된 `model_name`을 사용한다.
- `backend/modules/analyst_runtime/food_analyst.py:558-582`가 추출된 성분을 다시 알러지 관점으로 평가하는 두 번째 호출이다. 성분이 있고 평가가 켜져 있으면 같은 모델을 한 번 더 호출한다.
- `backend/server.py:4578-4805`의 공통 label pipeline은 품질 gate, label cost guardrail, monthly usage 기록 후 `analyst.analyze_label_json`으로 연결된다.
- `backend/modules/analyst_runtime/router.py:59-104`, `:150-161`은 smart router 분류 후 endpoint가 넘긴 라벨 handler가 있으면 라벨 분석 실행을 그 handler에 위임한다. `router_category`는 optional 응답 metadata로 유지된다.
- `backend/modules/analysis_jobs.py:205-235`의 비동기 job 경로도 `label`, `smart` 라벨 라우팅에서는 서버가 주입한 label handler를 통해 같은 품질 gate와 비용 guardrail을 사용한다.

따라서 현재 구현에서는 `GEMINI_LABEL_MODEL_NAME`을 명시하지 않은 상태만으로 Pro가 자동 선택되지 않는다. 일반적인 라벨 분석은 여전히 OCR 추출 1회와 알러지 평가 1회가 모두 실행될 수 있으므로, 기본 모델은 Flash 계열로 고정하고 Pro fallback은 명시적으로 켠 경우에만 허용한다.

다른 경로는 설정에 따라 Pro 비용이 발생할 수 있다.

- `/analyze`는 `GEMINI_MODEL_NAME`을 사용한다. 운영 환경에서 `GEMINI_MODEL_NAME=gemini-2.5-pro`로 설정한 경우에만 Pro 비용이 발생한다.
- `/lookup/barcode`는 상품 성분이 있고 `allergy_info`가 `None`이 아닐 때만 Gemini를 호출한다. 이 경로는 `GEMINI_LABEL_MODEL_NAME`이 아니라 `GEMINI_MODEL_NAME`을 사용한다.
- `/analyze/smart`는 먼저 `gemini-2.0-flash`로 이미지를 분류한다. 이후 라벨로 라우팅될 때만 Pro 라벨 경로를 탈 수 있다.

재시도와 출력 토큰 비용 리스크:

- 음식 분석은 `max_output_tokens=4096`으로 시작하고, max-token 종료가 발생하면 한 번 더 `8192`까지 늘려 재시도할 수 있다.
- 라벨 OCR, 라벨 알러지 평가, 바코드 알러지 분석은 현재 명시적인 `max_output_tokens` 제한이 없다.
- 음식 분석 재시도는 `GEMINI_RETRY_MAX_ATTEMPTS`로 제한된다. 라벨 429 재시도는 호출부에서 최대 3회로 고정되어 있다.
- 현재 코드는 Gemini thinking 설정을 쓰지 않는다. 다만 Google 가격표는 텍스트 출력을 응답과 reasoning으로 표기하므로, 향후 thinking/reasoning 출력을 켜면 출력 토큰 비용으로 계산해야 한다.
- OpenAI reasoning token도 출력 토큰 예산에 포함해서 관리해야 한다.

## 2. 모델 가격 비교

아래 가격은 공식 가격표의 Standard 기준, 1M 토큰당 USD다. FoodLens 요청당 비용 추정은 특별히 긴 프롬프트가 아니라면 short-context 가격을 기준으로 계산한다.

| 모델 | 입력 | 캐시 입력 | 출력 / reasoning | 이미지 입력 처리 | FoodLens 관점 |
| --- | ---: | ---: | ---: | --- | --- |
| Gemini 2.5 Pro | $1.25 <=200K, $2.50 >200K | $0.13 <=200K, $0.25 >200K | $10 <=200K, $15 >200K | 텍스트, 이미지, 비디오, 오디오가 입력 토큰으로 과금 | 품질 fallback용으로는 유효하지만 2-pass 라벨 기본값으로는 비싸다. |
| Gemini 2.5 Flash | $0.30 | $0.03 | $2.50 | 텍스트, 이미지, 비디오 입력 지원 | 라벨 OCR과 음식 이미지 분석의 기본 후보로 가장 현실적이다. |
| Gemini 2.5 Flash Lite | $0.10 | $0.01 | $0.40 | 텍스트, 이미지, 비디오 입력 지원 | smart router와 바코드 텍스트 알러지 분석의 저비용 후보지만 알러지 recall 검증이 필요하다. |
| GPT-5.4 | $2.50 short, $5.00 long | $0.25 short, $0.50 long | $15 short, $22.50 long | 이미지 입력은 입력 토큰으로 과금 | 고품질 후보지만 기본 모델로 쓰기에는 비용 이점이 작다. |
| GPT-5.4 mini | $0.75 | $0.075 | $4.50 | 32px 패치 기반 이미지 토큰화, multiplier 1.62 | OpenAI 계열 라벨 OCR/음식 분석 후보로 A/B 테스트할 만하다. |
| GPT-5.4 nano | $0.20 | $0.02 | $1.25 | 32px 패치 기반 이미지 토큰화, multiplier 2.46 | smart router와 텍스트 알러지 분석 후보로 적합하다. 라벨 OCR은 recall 검증 후 판단한다. |

OpenAI 이미지 입력은 텍스트와 비슷하게 입력 토큰으로 과금된다. GPT-5.4 mini와 nano는 공식 이미지 가이드 기준으로 32px x 32px 패치 수를 계산하고, 모델별 multiplier를 적용한다.

Google Gemini 2.5 가격표는 텍스트 출력을 응답과 reasoning으로 표기한다. short-context 기준 Gemini 2.5 Pro 출력 단가는 Gemini 2.5 Flash의 4배, Gemini 2.5 Flash Lite의 25배다.

## 3. 기능별 추천 모델

| 기능 | 현재 동작 | 추천 기본 모델 | Pro 사용 조건 |
| --- | --- | --- | --- |
| `/analyze` 음식 이미지 분석 | `GEMINI_MODEL_NAME`, 기본 `gemini-2.0-flash` | Gemini 2.5 Flash 또는 GPT-5.4 mini A/B 후보 | 낮은 confidence, 안전상 중요한 불확실성, 저가 모델 실패 시에만 사용 |
| `/analyze/label` 라벨 OCR + 알러지 평가 | `GEMINI_LABEL_PRIMARY_MODEL_NAME`, 기본 `gemini-2.5-flash`, 1회 또는 2회 호출 | OCR 추출은 Gemini 2.5 Flash 또는 GPT-5.4 mini, 알러지 평가는 Gemini 2.5 Flash Lite 또는 GPT-5.4 nano | JSON parse 실패 등 기본 모델 실패 후 `GEMINI_LABEL_PRO_FALLBACK_ENABLED=1`일 때만 |
| `/analyze/smart` router | `gemini-2.0-flash`로 분류 후 음식/라벨 경로로 이동 | Gemini 2.5 Flash Lite 또는 GPT-5.4 nano | router 자체에는 Pro를 쓰지 않음 |
| `/lookup/barcode` 성분 알러지 텍스트 분석 | 성분과 알러지가 있을 때 `GEMINI_MODEL_NAME` 호출 | Gemini 2.5 Flash Lite 또는 GPT-5.4 nano | 복잡한 다국어 성분명 등에서만 Gemini 2.5 Flash로 승격, Pro는 원칙적으로 제외 |

## 4. 비용 절감 우선순위

1. 라벨 모델 기본값을 Flash로 유지한다. `GEMINI_LABEL_MODEL_NAME`이 비어 있다는 이유로 운영에서 `gemini-2.5-pro`를 쓰면 안 된다.
2. 라벨 OCR 추출 모델과 알러지 평가 모델을 분리한다. 두 번째 pass는 텍스트-only 작업이므로 Pro를 기본으로 재사용할 이유가 약하다.
3. 라벨 OCR, 라벨 알러지 평가, 바코드 알러지 분석에 명시적인 `max_output_tokens`를 추가한다.
4. Gemini/OpenAI 호출 경계에서 비용 사용량을 기록한다. route, provider, model, token usage, retry count, fallback count, chargeable 여부를 남겨야 한다.
5. 월간 비용 사용량 저장소는 Render/env 기본값에서 Postgres를 사용한다. Dashboard drift로 `memory` backend가 되지 않도록 release gate에서 확인한다.
6. 바코드 성분 알러지 분석은 정규화된 성분 목록, 알러지 프로필, locale, prompt version 기준으로 캐시한다.
7. Pro fallback은 opt-in, 낮은 비율, golden eval 통과 후에만 허용한다.
8. release gate에 Render env readiness를 추가한다. 최소 확인 항목은 `GEMINI_LABEL_PRIMARY_MODEL_NAME`, `GEMINI_LABEL_PRO_FALLBACK_ENABLED`, `GEMINI_LABEL_ALLOW_PRO_PRIMARY`, `GEMINI_MODEL_NAME`, `GCP_PROJECT_ID`, `GCP_LOCATION`, `GCP_SERVICE_ACCOUNT_JSON`, `LABEL_MONTHLY_BUDGET_USD`, `LABEL_ESTIMATED_*`다.

## 5. A/B 테스트 설계

모델 기본값을 바꾸기 전에 최소 golden set이 필요하다.

- 실제 음식 이미지 30개: 조리 음식, 혼합 음식, 포장 식품, 소스, 디저트, 저조도 이미지를 포함한다.
- 실제 라벨 이미지 50개: 한국어, 영어, 일본어, 영양성분표만 있는 이미지, 원재료명만 있는 이미지, 반사, 기울어짐, 작은 글씨, 구겨진 포장을 포함한다.
- 바코드 성분 텍스트 50개: 정답 알러지 판정이 있는 샘플이어야 한다.
- smart router 이미지 20개: 음식, 라벨, 바코드, 메뉴, 음식 아님을 포함한다.

측정 지표:

- 성공률: HTTP 2xx이고 fallback이 아닌 응답 비율.
- JSON parse rate: repair 없이 스키마 검증을 통과한 비율.
- Allergen recall: 실제 알러지 성분 중 모델이 찾아낸 비율. 안전상 가장 중요한 지표다.
- Allergen false positive rate: 안전한 성분을 알러지로 잘못 표시한 비율.
- OCR ingredient recall: golden 성분 중 추출된 성분 비율.
- Latency: route/model별 p50, p95, p99.
- 요청당 비용: 입력 토큰, 캐시 입력 토큰, 출력 토큰, reasoning/thinking 토큰, retry 횟수, 최종 USD 추정치.
- Degradation: fallback rate, retry rate, max-output retry rate.

실험군:

- 기준군: 현재 Gemini 2.5 Pro 라벨 분석.
- 후보 A: Gemini 2.5 Flash OCR 추출 + Gemini 2.5 Flash Lite 알러지 평가.
- 후보 B: GPT-5.4 mini OCR 추출 + GPT-5.4 nano 알러지 평가.
- 후보 C: Gemini 2.5 Flash OCR 추출 + GPT-5.4 nano 알러지 평가.

승격 조건:

- JSON parse rate >= 99%.
- Allergen recall이 기준군 이상이고 치명적인 알러지 false negative가 없어야 한다.
- p95 latency가 기준군 이하이어야 한다.
- 라벨 요청당 예상 비용이 기준군의 35% 이하이어야 한다.
- 실제 golden image set으로 품질 회귀 검증을 통과해야 한다.

## 6. Feature flag 기반 rollout 계획

현재 사용할 수 있는 주요 설정:

- `GEMINI_MODEL_NAME`
- `GEMINI_LABEL_PRIMARY_MODEL_NAME`
- `GEMINI_LABEL_FALLBACK_MODEL_NAME`
- `GEMINI_LABEL_PRO_FALLBACK_ENABLED`
- `GEMINI_LABEL_ALLOW_PRO_PRIMARY`
- `GEMINI_LABEL_MODEL_NAME` 기존 호환용 값
- `LABEL_COST_GUARDRAIL_ENABLED`
- `LABEL_MONTHLY_BUDGET_USD`
- `LABEL_ESTIMATED_COST_USD_PER_REQUEST`
- `LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE`
- `LABEL_ROLLOUT_ENABLED`
- `LABEL_ROLLOUT_PERCENTAGE`
- `LABEL_ROLLOUT_STAGE`
- `LABEL_ROLLOUT_AUTO_ENABLED`

추가할 것을 권장하는 설정:

- `AI_PROVIDER_ANALYZE`
- `AI_PROVIDER_LABEL_EXTRACT`
- `AI_PROVIDER_LABEL_ASSESS`
- `AI_PROVIDER_SMART_ROUTER`
- `AI_PROVIDER_BARCODE_ALLERGEN`
- `AI_MODEL_ANALYZE`
- `AI_MODEL_LABEL_EXTRACT`
- `AI_MODEL_LABEL_ASSESS`
- `AI_MODEL_SMART_ROUTER`
- `AI_MODEL_BARCODE_ALLERGEN`
- `AI_PRO_FALLBACK_ENABLED`
- `AI_PRO_FALLBACK_PERCENTAGE`
- `AI_COST_PRICE_CATALOG_VERSION`
- `AI_COST_GUARDRAIL_MODE`

rollout 순서:

1. Shadow eval: 실제 응답에는 반영하지 않고 golden set에서 후보 모델만 평가한다.
2. 내부 트래픽 1%: 라벨 OCR 추출만 후보 모델로 보내고, 알러지 평가는 기존 기준군을 유지한다.
3. 5%: 라벨 전체 후보 모델을 적용하되 Pro fallback을 켠다.
4. 25%: parse, recall, latency, cost KPI가 통과할 때만 올린다.
5. 50%와 100%: 충분한 운영 트래픽 또는 한 번의 과금 주기 검증 이후에만 올린다.
6. 문제가 생기면 모든 route를 기존 Gemini 설정으로 되돌리는 kill switch를 유지한다.

## 7. Pro 모델을 fallback으로만 쓰는 조건

Pro는 일반 경로에서 끄고, 아래 조건을 모두 만족할 때만 사용한다.

- `AI_PRO_FALLBACK_ENABLED=1`.
- 이미지 품질 gate를 통과했다.
- 저가 모델이 1회 bounded repair retry 후에도 JSON schema parse에 실패했다.
- 또는 저가 모델의 OCR confidence가 낮고, 안전상 중요한 성분 필드가 불확실하다.
- 또는 사용자의 등록 알러지와 관련된 성분 판단이 모호하다.
- 사용자별, route별, 월간 예산 guardrail을 초과하지 않았다.
- fallback 경로에도 명시적인 `max_output_tokens`가 있고 provider, model, route, attempt, usage metadata를 기록한다.

Pro는 smart router의 일반 분류나 바코드 텍스트 알러지 분석에는 쓰지 않는다. 단, golden set에서 저가 모델이 치명적인 알러지를 놓친다는 측정 근거가 있으면 별도 정책으로 검토한다.

## 8. 월 예산 $10 기준 guardrail 재설계

현재 라벨 guardrail은 `LABEL_MONTHLY_BUDGET_USD=10.0`과 `LABEL_ESTIMATED_COST_USD_PER_REQUEST=0.02`를 사용한다. 이 기준이면 월 $10으로 라벨 분석 약 500건을 허용한다. warn은 약 350건, degrade는 약 425건, fallback은 약 500건 근처에서 발생한다.

문제는 세 가지다.

- `/analyze/label`, `/analyze/smart` 라벨 라우팅, `/analyze` 음식 분석, `/analyze/smart` 음식 라우팅, `/lookup/barcode` 성분 알러지 분석, label/smart async job 라벨 라우팅에 적용된다.
- `/analyze`와 `/lookup/barcode`는 현재 provider token metadata가 아니라 `FOOD_ANALYSIS_ESTIMATED_*`, `BARCODE_ALLERGEN_ESTIMATED_*` 추정치를 기록한다.
- Render/env drift로 `LABEL_COST_GUARDRAIL_STORAGE_BACKEND=memory`가 배포되면 서버 재시작 또는 다중 인스턴스에서 월간 비용 집계가 정확하지 않다.

권장 설계:

- 공식 가격표 URL, 확인일, provider, model, 입력 단가, 캐시 입력 단가, 출력 단가, reasoning/thinking 과금 정책을 별도 price catalog로 저장한다. catalog 단가는 공식 출처에서 확인한 양수 숫자만 허용하고, source URL에는 credential, query string, fragment를 넣지 않는다.
- `AI_COST_PRICE_CATALOG_PATH`로 배포한 JSON catalog가 있으면 provider token usage를 catalog 단가로 달러 추정치로 변환한다. catalog 구조와 검증 절차는 `docs/ops/ai-cost-price-catalog.md`를 따른다.
- 모델 호출 전 route, 이미지 토큰 추정치, 프롬프트 토큰 추정치, 요청한 max output, retry budget, fallback 가능성을 기준으로 예상 비용을 계산한다.
- 응답 후 Gemini `usage_metadata`가 있으면 라벨 추출/평가와 스마트 라우터 분류의 실제 토큰 수를 기록한다. `total_tokens`가 없으면 cached-only usage를 놓치지 않도록 `max(prompt_tokens, cached_tokens) + completion_tokens + thoughts_tokens`를 기록 token 합계로 쓴다. metadata가 없거나 Pro fallback에서 실패한 primary 호출을 과소 집계할 수 있는 경우에는 기존 `LABEL_ESTIMATED_*`, `SMART_ROUTER_ESTIMATED_*` 추정치를 사용한다.
- 호출 전 예약한 예상 비용은 성공 시 실제/추정 사용량으로 commit하고, 실패/429에서는 release한다. 프로세스 crash 등으로 남은 예약분은 `COST_GUARDRAIL_RESERVATION_TTL_SECONDS`가 지난 뒤 다음 예약 시 자동 release한다.
- `/analyze`, `/lookup/barcode`, `/analyze/smart`의 음식/라벨 하위 라우팅까지 포함하는 전체 AI 월간 예산 guardrail을 적용한다.
- 월 예산을 route별로 나눈다. 예를 들어 label 60%, food 25%, barcode 10%, smart router 5%로 시작하고 운영 설정으로 조정한다.
- route별 최대 요청 수는 아래 공식으로 계산한다.

```text
max_requests_for_route = floor((monthly_budget_usd * route_budget_ratio) / estimated_cost_usd_per_request_p95)
```

월 예산이 $10이라고 해서 요청당 고정 임계값을 박아두면 안 된다. 공식 단가와 실제 p95 token usage를 기준으로 주기적으로 다시 계산해야 한다.

degrade 순서:

1. 라벨 알러지 평가 pass를 끈다.
2. 알러지 평가는 text-only 저가 모델로 낮춘다.
3. 품질이 낮은 라벨 이미지는 재촬영을 요구한다.
4. 마지막으로 모델 호출 없이 안전 fallback을 반환한다.

## 9. Render/GCP 감사 문서와 연결되는 운영 확인

`docs/ops/render-google-cloud-env-audit.md`는 실제 Render env key와 비용 발생 코드 경로를 연결한다. 이 문서의 모델 전환 설계는 해당 감사 문서의 Dashboard 확인 항목과 함께 적용해야 한다.

Render Dashboard에서 확인할 항목:

- `foodlens-api`와 `foodlens-worker`의 `GEMINI_LABEL_PRIMARY_MODEL_NAME`: 기본 라벨 모델이다. `render.yaml` 기준값은 `gemini-2.5-flash`다.
- `GEMINI_LABEL_PRO_FALLBACK_ENABLED`: `0`이면 Pro fallback이 꺼진다. `1`이면 기본 모델 실패 후에만 `GEMINI_LABEL_FALLBACK_MODEL_NAME`을 시도한다.
- `GEMINI_LABEL_ALLOW_PRO_PRIMARY`: `0`이면 Pro를 기본 라벨 모델로 쓰지 못하게 막는다.
- `GEMINI_MODEL_NAME`: `/analyze`와 `/lookup/barcode`의 Gemini 모델이다. Pro로 설정되어 있으면 라벨 외 경로에서도 Pro 비용이 발생할 수 있다.
- `GCP_PROJECT_ID`와 `GCP_LOCATION`: GCP Billing Reports와 Vertex AI Usage/Quotas에서 보는 project/region과 일치해야 한다.
- `AI_COST_PRICE_CATALOG_PATH`: 공식 가격표 또는 Cloud Billing Console SKU를 확인한 JSON catalog 경로다. 설정되면 Gemini `usage_metadata`의 provider/model/token component를 catalog 단가로 달러 추정치로 변환한다.
- `LABEL_COST_GUARDRAIL_ENABLED`, `LABEL_MONTHLY_BUDGET_USD`, `LABEL_ESTIMATED_COST_USD_PER_REQUEST`, `LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE`, `FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST`, `BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST`: catalog가 없으면 route별 추정치 또는 Gemini `usage_metadata`의 실제 토큰 수를 기존 추정 단가에 비례 배분한다. `/analyze`와 `/lookup/barcode`도 guardrail 대상이며, catalog가 설정된 상태에서 provider/model entry가 없으면 실패로 처리해 누락 SKU를 드러낸다.
- `COST_GUARDRAIL_RESERVATION_TTL_SECONDS`: 예약 후 프로세스가 종료되어 release/commit이 실행되지 않은 비용을 자동 해제하기 전까지 기다리는 시간이다. 기본값은 900초다.

GCP Console에서 확인할 항목:

- Billing Reports에서 service를 Vertex AI로 필터링하고 Gemini 2.5 Pro 관련 text output/reasoning SKU의 시간대를 `/analyze/label` 로그와 맞춘다.
- Vertex AI quota에서 Gemini 2.5 Pro/Flash/Flash Lite별 요청/토큰 제한과 429 발생 여부를 본다.
- Budget alerts는 앱 내부 guardrail과 별도로 설정한다. 앱 내부 guardrail은 현재 라벨 추정치 중심이고 GCP 전체 비용 차단 장치가 아니다.

Release gate에 추가할 항목:

- PR/릴리스 체크에서 `render.yaml`과 코드가 읽는 AI env key drift를 보고한다.
- `GEMINI_LABEL_PRIMARY_MODEL_NAME`이 `gemini-2.5-flash`가 아니거나 `GEMINI_LABEL_ALLOW_PRO_PRIMARY=1`이면 Go/No-Go 회의에서 명시적으로 승인하도록 한다.
- 모델 기본값 변경 PR은 golden image set, JSON parse rate, allergen recall, p95 latency, request당 비용 추정치를 artifact로 남긴다.
- fallback-only Pro 정책이 꺼져 있는데 Pro 모델이 기본 경로에 있으면 release warning 이상으로 본다.

## 바로 착수할 1순위 패치

라벨 경로의 provider/model 분리를 먼저 구현한다.

1. 기존 Gemini 경로는 유지한다.
2. 라벨 OCR 추출 모델과 라벨 알러지 평가 모델을 별도 env key로 분리한다.
3. Render 운영 환경에는 `GEMINI_MODEL_NAME=gemini-2.0-flash`, `GEMINI_LABEL_PRIMARY_MODEL_NAME=gemini-2.5-flash`, `GEMINI_LABEL_PRO_FALLBACK_ENABLED=0`, `GEMINI_LABEL_ALLOW_PRO_PRIMARY=0`을 명시한다.
4. 라벨 두 pass 모두에 `max_output_tokens`를 추가한다.
5. 운영 모델 변경 전 golden label set으로 품질 회귀를 검증한다.

이 패치가 가장 먼저 필요한 이유는 Pro 비용 발생 원인이 명확하게 라벨 2-pass 경로에 있고, 모바일 앱 동작이나 `/analyze`, `/lookup/barcode`의 기존 흐름을 크게 흔들지 않으면서 비용을 줄일 수 있기 때문이다.
