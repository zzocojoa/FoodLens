# AI Cost Price Catalog

`AI_COST_PRICE_CATALOG_PATH`가 설정되면 서버는 Gemini `usage_metadata`의 provider/model/token 사용량을 catalog 단가로 달러 추정치로 변환한다.
설정하지 않으면 기존 `LABEL_ESTIMATED_*`, `FOOD_ANALYSIS_ESTIMATED_*`, `BARCODE_ALLERGEN_ESTIMATED_*`, `SMART_ROUTER_ESTIMATED_*` 값으로 기록한다.

catalog는 공식 가격표나 Cloud Billing Console에서 확인한 값을 운영자가 별도 파일로 관리한다.
코드에는 공식 단가를 하드코딩하지 않는다.
현재 배포용 catalog 파일은 `backend/config/ai-price-catalog.json`이고, Render Docker 컨테이너에서는 `AI_COST_PRICE_CATALOG_PATH=/app/backend/config/ai-price-catalog.json`로 설정한다.

## 필수 원칙

- 단가는 business logic이 아니라 배포 환경의 JSON config로 관리한다.
- 각 단가 component는 `sku`, `source_url`, `verified_at`를 반드시 가진다.
- `source_url`은 provider 공식 가격 문서 또는 Cloud Billing Console에서 추적 가능한 공식 URL만 쓴다.
- `source_url`은 credential, query string, fragment를 포함하지 않는 HTTPS URL이어야 한다.
- `verified_at`은 사람이 확인한 날짜를 `YYYY-MM-DD`로 기록한다.
- `usd_per_1m_tokens`는 운영자가 공식 출처에서 확인한 양수 숫자여야 한다. `0`, `NaN`, placeholder 값은 배포 catalog에서 허용하지 않는다.
- 가격 변경 확인 없이 모델 기본값이나 fallback 정책을 바꾸지 않는다.
- secret, access token, billing account id 전체값은 catalog와 문서에 기록하지 않는다.
- Gemini 호출을 새로 만들어 catalog를 검증하지 않는다. 비용을 쓰지 않으려면 공식 가격표, Cloud Billing Pricing API, Pricing Table, 기존 Billing Reports만 사용한다.

## JSON 구조

```json
{
  "version": "vertex-ai-gemini-YYYY-MM-DD",
  "entries": [
    {
      "provider": "google_vertex_ai",
      "model": "gemini-2.5-flash",
      "input": {
        "usd_per_1m_tokens": "REPLACE_WITH_OFFICIAL_POSITIVE_RATE",
        "sku": "REPLACE_WITH_OFFICIAL_INPUT_SKU",
        "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
        "verified_at": "YYYY-MM-DD"
      },
      "cached_input": {
        "usd_per_1m_tokens": "REPLACE_WITH_OFFICIAL_POSITIVE_RATE",
        "sku": "REPLACE_WITH_OFFICIAL_CACHED_INPUT_SKU",
        "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
        "verified_at": "YYYY-MM-DD"
      },
      "output": {
        "usd_per_1m_tokens": "REPLACE_WITH_OFFICIAL_POSITIVE_RATE",
        "sku": "REPLACE_WITH_OFFICIAL_OUTPUT_SKU",
        "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
        "verified_at": "YYYY-MM-DD"
      },
      "thoughts": {
        "usd_per_1m_tokens": "REPLACE_WITH_OFFICIAL_POSITIVE_RATE",
        "sku": "REPLACE_WITH_OFFICIAL_THOUGHTS_OR_REASONING_SKU",
        "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
        "verified_at": "YYYY-MM-DD"
      }
    }
  ]
}
```

`input`과 `output`은 필수다.
`cached_input`은 provider usage에 cached token이 있고 공식 cached-input 과금 항목이 있을 때 설정한다.
`thoughts`는 provider usage에 reasoning/thinking token이 있고 해당 과금 항목이 있을 때 설정한다.
해당 token이 들어왔는데 catalog에 component 단가가 없으면 서버는 catalog 오류를 발생시켜 잘못된 저가 추정을 막는다.
위 예시는 schema template이다. 실제 JSON 파일에서는 `usd_per_1m_tokens`를 문자열 placeholder가 아니라 공식 출처에서 확인한 양수 숫자로 바꿔야 한다.
현재 schema는 FoodLens의 표준 text/image Vertex 요청에 필요한 token component만 다룬다. audio, Live API, Batch/Flex/Priority traffic, context cache storage, grounding/search/maps tool, image output, tuning처럼 별도 SKU가 붙는 사용 방식은 catalog schema 확장 전까지 운영에서 켜지 않는다.

## 비용 계산

- `prompt_tokens - cached_tokens`: `input.usd_per_1m_tokens`
- `cached_tokens`: `cached_input.usd_per_1m_tokens`
- `completion_tokens`: `output.usd_per_1m_tokens`
- `thoughts_tokens`: `thoughts.usd_per_1m_tokens`

provider/model에 맞는 catalog entry가 없으면 서버는 catalog 오류를 발생시킨다.
provider usage에 `total_tokens`가 있으면 기록 token 합계는 그 값을 사용한다. 없으면 `max(prompt_tokens, cached_tokens) + completion_tokens + thoughts_tokens`를 사용해 cached-only usage를 누락하지 않고, prompt token에 포함된 cached token은 중복 집계하지 않는다.
`total_tokens`와 component token 합계가 맞지 않으면 partial breakdown으로 보고 catalog 오류를 발생시킨다. 일부 component만 내려온 응답을 싼 값으로 잘못 계산하지 않기 위한 fail-closed 정책이다.
catalog를 설정하지 않은 경우에는 provider token 수로 단가를 역산하지 않고 기존 per-request 추정치로 기록한다. production guardrail에서는 모든 활성 모델을 catalog에 등록해야 한다.
catalog 오류가 모델 호출 후 발견되면 이미 예약된 요청 비용은 기존 추정치로 커밋하고 사용자 응답은 유지한다. 같은 요청을 사용자가 재시도해 추가 비용을 쓰지 않게 하면서 월간 guardrail 총액도 과소 집계하지 않기 위한 정책이다.

## 운영 확인

1. 공식 가격 문서와 Cloud Billing Console SKU를 확인한다.
2. Cloud Billing SKU ID, SKU description, service, region/location, pricing unit, effective date, currency, list/contract price 여부를 private reconciliation artifact에 기록한다. billing account id 전체값은 저장하지 않는다.
3. `backend/config/ai-price-catalog.json`의 `version`과 각 component `verified_at`를 갱신한다.
4. Gemini 2.5 Pro처럼 context length별 tier가 다른 모델은 어떤 tier를 catalog에 넣었는지 명시한다. 현재 checked-in catalog는 과소 집계를 막기 위해 Pro의 `>200K input tokens` tier를 보수적으로 사용한다.
5. `AI_COST_PRICE_CATALOG_PATH`를 API, worker, retention-cron 환경에 같은 경로로 배포한다.
6. 라벨, smart router 경로의 provider usage 로그에서 `source=price_catalog:<version>` 기록이 나오는지 확인한다. 이 확인은 기존 자연 트래픽 로그로만 수행하고, catalog 검증 목적으로 `/analyze`, `/analyze/label`, `/analyze/smart`, `/lookup/barcode`를 새로 호출하지 않는다.
7. `/analyze`와 `/lookup/barcode`도 AI 비용 guardrail 대상이며, provider usage metadata가 노출될 때까지 route별 추정치를 사용한다.
8. 월간 guardrail 총액을 Cloud Billing Reports의 Vertex AI 비용과 대조한다.

## Private SKU Reconciliation Artifact

계정별 계약 단가와 canonical Cloud Billing SKU ID는 저장소에 커밋하지 않는다. 운영자는 `docs/ops/ai-cost-sku-reconciliation-template.csv`를 복사해 `artifacts/private/ai-cost-sku-reconciliation.local.csv`에 채운다. `artifacts/private/`는 git ignore 대상이다.

현재 catalog 기준으로 필요한 행은 14개다.

| model | component |
| --- | --- |
| `gemini-2.0-flash` | `input`, `output` |
| `gemini-2.5-flash` | `input`, `cached_input`, `output`, `thoughts` |
| `gemini-2.5-flash-lite` | `input`, `cached_input`, `output`, `thoughts` |
| `gemini-2.5-pro` | `input`, `cached_input`, `output`, `thoughts` |

`gemini-2.5-flash-lite`는 checked-in catalog에는 포함되어 있지만 현재 Render 기본 모델은 아니다. 운영 env에서 `GEMINI_LABEL_PRIMARY_MODEL_NAME`, legacy `GEMINI_LABEL_MODEL_NAME`, 또는 다른 모델 override가 Flash-Lite로 바뀌는 경우를 대비해 private artifact에 같이 남겨 둔다.

필수 확인 열:

- `catalog_token_counter`: FoodLens가 어떤 provider token 필드를 해당 component 비용으로 매핑하는지 기록한다.
- `cloud_billing_sku_id`: Pricing Table 또는 Pricing API의 canonical SKU ID다.
- `cloud_billing_sku_description`: Cloud Billing에 표시되는 SKU 설명이다.
- `cloud_billing_service_id`, `cloud_billing_service_description`: Vertex AI/Gemini가 어느 service 항목으로 청구되는지 기록한다.
- `billing_region_or_location`, `pricing_unit`, `usage_unit`, `currency`: 같은 SKU라도 지역/단위가 달라지는지 확인한다.
- `list_price_usd_per_1m_tokens`, `contract_price_usd_per_1m_tokens`, `price_basis`: list 가격인지 계약 가격인지 구분한다. 둘 다 알 수 있으면 둘 다 채우고, 실제 guardrail에는 계약 단가를 우선한다.
- `context_tier_name`, `context_tier_min_tokens`, `context_tier_max_tokens`: Gemini 2.5 Pro처럼 `<=200K`, `>200K` tier가 나뉘는 경우를 명시한다.
- `maps_to_catalog_rate`: private artifact의 단가가 `backend/config/ai-price-catalog.json`의 단가와 일치하면 `yes`, 보수 tier라 의도적으로 다르면 `conservative`, 불일치면 `no`로 기록한다.
- `reconciliation_status`: 아직 확인 전이면 `pending`, Cloud Billing 기준으로 확인했으면 `verified`, 현재 catalog와 다르면 `needs_catalog_update`로 기록한다.

비용을 쓰지 않는 확인 경로:

1. Google Cloud Console의 Billing > Pricing table에서 필요한 billing account를 선택하고, `SKU ID`, `SKU description`, `Service ID`, `Service description`, `Price reason`, `Tiered usage start`, `List price`, `Contract price` 열을 켠다.
2. Vertex AI 또는 Gemini 관련 SKU를 필터링하고 필요한 14개 component에 대응되는 행을 private CSV에 옮긴다.
3. 계약 단가가 필요하면 Cloud Billing Pricing API의 billing-account-specific price endpoint 또는 Pricing Table의 contract price 열만 사용한다.
4. 이미 발생한 과거 청구만 확인할 때는 Billing Reports, Pricing Table의 historical usage, 또는 BigQuery billing export를 사용한다. BigQuery export가 이미 켜져 있지 않다면 이 확인만을 위해 새 export/query를 만들지 않는다.
5. 이 확인을 위해 `/analyze`, `/analyze/label`, `/analyze/smart`, `/lookup/barcode`, `/analyze/jobs`를 호출하지 않는다.

공식 확인 출처:

- Vertex AI / Gemini 가격표: https://cloud.google.com/vertex-ai/generative-ai/pricing
- Cloud Billing Pricing Table: https://docs.cloud.google.com/billing/docs/how-to/pricing-table
- Cloud Billing Pricing API: https://docs.cloud.google.com/billing/docs/reference/pricing-api/rest
- BigQuery pricing export schema: https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/pricing-data
