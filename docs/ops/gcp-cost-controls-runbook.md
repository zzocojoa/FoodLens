# GCP Cost Controls Runbook

이 문서는 Google Cloud Console에서 비용 방지 설정을 확인하고, 저장소에는 secret 없이 확인 증적만 남기는 절차다. 이 절차는 Gemini, Vertex AI, `/analyze`, `/lookup/barcode`를 호출하지 않는다.

## 대상

반드시 확인할 항목은 5개다.

| control_id | 확인 대상 | 목적 |
| --- | --- | --- |
| `gcp_budget_alert` | Cloud Billing Budget alert | 예산 초과 전 알림 |
| `vertex_ai_quota` | Vertex AI / Gemini quota | 모델별 과다 사용 차단 |
| `service_account_minimum_iam` | Render GCP service account IAM | 과도한 권한 축소 |
| `gcs_lifecycle_policy` | Cloud Storage bucket lifecycle | 미디어 저장 비용 상한 |
| `google_maps_api_key_restriction` | Google Maps API key restriction | 공개 mobile key 남용 방지 |

## Evidence 파일

운영자는 템플릿을 private 경로로 복사한다.

```bash
cd /private/tmp/foodlens-ai-cost-guardrail
mkdir -p artifacts/private
cp docs/ops/gcp-cost-controls-evidence-template.csv artifacts/private/gcp-cost-controls-evidence.local.csv
```

`artifacts/private/`는 git ignore 대상이다. 이 파일에는 실제 secret, API key 전체값, service account JSON, billing account id 전체값, console URL query string을 넣지 않는다.

각 행은 Console에서 확인한 뒤 다음처럼 바꾼다.

- `status`: `verified`
- `verified_at`: `YYYY-MM-DD`
- `verified_by`: 확인자 이름 또는 운영자 식별자
- `resource_ref_redacted`: bucket/key/service account/budget 이름을 redacted 형태로 기록
- `evidence_ref`: private 증적 파일명만 기록. live Console URL은 넣지 않는다.

검증 명령:

```bash
python3 backend/scripts/gcp_cost_controls_evidence_gate.py \
  --evidence-path artifacts/private/gcp-cost-controls-evidence.local.csv
```

이 명령은 CSV만 읽으며 Google Cloud API를 호출하지 않는다.

## Console 확인

### 1. Budget alert

Google Cloud Console > Billing > Budgets & alerts에서 FoodLens billing project에 월 예산과 알림 threshold가 있는지 확인한다. 앱 내부 `$10` guardrail은 Vertex/GCS/Maps 전체 청구를 막지 못하므로 Cloud Billing Budget alert가 별도로 필요하다.

공식 문서: https://cloud.google.com/billing/docs/how-to/budgets

### 2. Vertex AI quota

Google Cloud Console > IAM & Admin > Quotas 또는 Vertex AI quota 화면에서 `GCP_PROJECT_ID`와 `GCP_LOCATION` 기준으로 Gemini Flash, Flash Lite, Pro 관련 요청/토큰 quota를 확인한다. 비용을 쓰고 싶지 않으면 quota 확인만 하고 모델 호출 테스트는 하지 않는다.

공식 문서:

- https://cloud.google.com/vertex-ai/docs/quotas
- https://cloud.google.com/vertex-ai/generative-ai/docs/quotas

### 3. Service account 최소 권한

Render의 `GCP_SERVICE_ACCOUNT_JSON`에 들어간 service account가 필요한 권한만 갖는지 확인한다. FoodLens 기준 필요한 권한 범위는 Vertex AI 호출, GCS object read/write/delete다. 과도한 owner/editor 권한은 제거 대상이다.

공식 문서: https://cloud.google.com/iam/docs

### 4. GCS lifecycle policy

Cloud Storage > Buckets > FoodLens media bucket > Lifecycle에서 original/derived media TTL이 운영 정책과 맞는지 확인한다. 앱 정책은 original 30일, derived 90일 TTL을 기준으로 관리한다.

공식 문서:

- https://cloud.google.com/storage/docs/lifecycle
- https://cloud.google.com/storage/docs/managing-lifecycles

### 5. Google Maps API key restriction

Google Cloud Console > APIs & Services > Credentials에서 `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`에 application restriction과 API restriction이 걸려 있는지 확인한다. Android는 package name과 SHA fingerprint 제한을 사용한다.

공식 문서:

- https://developers.google.com/maps/api-security-best-practices
- https://cloud.google.com/docs/authentication/api-keys

## 완료 기준

5개 행이 모두 `verified`이고 `gcp_cost_controls_evidence_gate.py`가 통과하면 5번 운영 리스크는 저장소 기준으로 완료다. 실제 Console 설정 자체는 Google Cloud Console이 source of truth다.
