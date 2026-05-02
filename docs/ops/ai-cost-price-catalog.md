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

## 비용 계산

- `prompt_tokens - cached_tokens`: `input.usd_per_1m_tokens`
- `cached_tokens`: `cached_input.usd_per_1m_tokens`
- `completion_tokens`: `output.usd_per_1m_tokens`
- `thoughts_tokens`: `thoughts.usd_per_1m_tokens`

provider/model에 맞는 catalog entry가 없으면 서버는 catalog 오류를 발생시킨다.
provider usage에 `total_tokens`가 있으면 기록 token 합계는 그 값을 사용한다. 없으면 `max(prompt_tokens, cached_tokens) + completion_tokens + thoughts_tokens`를 사용해 cached-only usage를 누락하지 않고, prompt token에 포함된 cached token은 중복 집계하지 않는다.
catalog를 설정하지 않은 경우에만 기존 per-request 추정치로 기록한다. production guardrail에서는 모든 활성 모델을 catalog에 등록해야 한다.

## 운영 확인

1. 공식 가격 문서와 Cloud Billing Console SKU를 확인한다.
2. `backend/config/ai-price-catalog.json`의 `version`과 각 component `verified_at`를 갱신한다.
3. `AI_COST_PRICE_CATALOG_PATH`를 API, worker, retention-cron 환경에 같은 경로로 배포한다.
4. 라벨, smart router 경로의 provider usage 로그에서 `source=price_catalog:<version>` 기록이 나오는지 확인한다. `/analyze`와 `/lookup/barcode`도 AI 비용 guardrail 대상이며, provider usage metadata가 노출될 때까지 route별 추정치를 사용한다.
5. 월간 guardrail 총액을 Cloud Billing Reports의 Vertex AI 비용과 대조한다.
