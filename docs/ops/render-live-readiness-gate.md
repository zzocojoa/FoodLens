# Render live readiness gate

작성일: 2026-05-02

이 게이트는 `render.yaml` 계약과 Render Dashboard의 실제 서비스 env/deploy 상태를 비교한다. 값은 stdout, summary artifact, workflow log에 출력하지 않고 key 이름과 pass/fail 범주만 남긴다.

## 목적

- `render.yaml`은 통과했지만 Render Dashboard 값이 달라진 drift를 배포 후에 차단한다.
- `foodlens-api`, `foodlens-worker`, `foodlens-retention-cron`의 최신 Render deploy가 `live`인지 확인한다.
- live readiness가 통과한 뒤에만 Phase 6 post-deploy smoke를 실행한다.

## 로컬 no-secret 검증

아래 명령은 Render API를 호출하지 않는다.

```bash
python3 backend/scripts/render_live_readiness_gate.py --mode dry-run
```

dry-run은 `render.yaml`의 FoodLens 서비스 세트, AI 비용 guardrail literal env, `AI_COST_PRICE_CATALOG_PATH` 같은 Dashboard-only `sync:false` 계약을 확인한다. 이 모드는 `RENDER_API_KEY`나 service id를 요구하지 않는다.

## live 검증 입력

live 모드는 아래 환경변수가 없으면 즉시 실패한다.

| env | 용도 |
| --- | --- |
| `RENDER_API_KEY` | Render API 호출용 secret |
| `RENDER_FOODLENS_API_SERVICE_ID` | `foodlens-api` service id |
| `RENDER_FOODLENS_WORKER_SERVICE_ID` | `foodlens-worker` service id |
| `RENDER_FOODLENS_RETENTION_CRON_SERVICE_ID` | `foodlens-retention-cron` service id |

세 service id는 서로 달라야 하며, Render API의 service 조회 결과가 기대한 service name과 일치해야 한다.

선택 입력:

| env | 용도 |
| --- | --- |
| `RENDER_DEPLOY_MIN_CREATED_AT` | 이 ISO timestamp 이후 생성된 deploy가 `live`인지 요구 |
| `RENDER_EXPECTED_GCP_PROJECT_ID` | 실제 `GCP_PROJECT_ID`가 의도한 billing project인지 값 출력 없이 비교 |

## live 실행

```bash
RENDER_API_KEY="${RENDER_API_KEY}" \
RENDER_FOODLENS_API_SERVICE_ID="${RENDER_FOODLENS_API_SERVICE_ID}" \
RENDER_FOODLENS_WORKER_SERVICE_ID="${RENDER_FOODLENS_WORKER_SERVICE_ID}" \
RENDER_FOODLENS_RETENTION_CRON_SERVICE_ID="${RENDER_FOODLENS_RETENTION_CRON_SERVICE_ID}" \
python3 backend/scripts/render_live_readiness_gate.py --mode live
```

summary는 기본적으로 `artifacts/phase6/render-live-readiness/summary.json`에 저장된다. summary에는 missing key, drift key, deploy status, service id 존재 여부, service name 일치 여부만 저장한다.

## 확인 범위

- `render.yaml`에 선언된 모든 env key가 live service에 존재하는지 확인한다.
- service id가 `foodlens-api`, `foodlens-worker`, `foodlens-retention-cron`에 각각 매핑되는지 확인한다.
- literal env는 값 일치 여부만 확인하고 값 자체는 출력하지 않는다.
- `sync:false` env는 존재 여부와 빈 값 여부만 확인한다.
- `AI_COST_PRICE_CATALOG_PATH`는 live service에 존재해야 하며, 값 자체는 출력하지 않는다. 현재 Docker 배포 경로는 `/app/backend/config/ai-price-catalog.json`이다. 실제 파일 존재와 catalog 최신성은 운영 catalog 검토에서 확인한다. 비용을 쓰지 않으려면 Phase 6 post-deploy smoke처럼 `/analyze/jobs`를 호출하는 검증은 실행하지 않는다.
- `foodlens-api`, `foodlens-worker`에는 비용/429 예측 가능성을 위해 Dashboard-only guard key를 요구한다.
  - `GCP_LOCATION`
  - `GEMINI_MAX_CONCURRENT_SLOTS`
  - `GEMINI_RETRY_INITIAL_SECONDS`
  - `GEMINI_RETRY_MAX_SECONDS`
  - `GEMINI_RETRY_MULTIPLIER`
  - `GEMINI_429_BACKOFF_INITIAL_SECONDS`
  - `GEMINI_429_BACKOFF_MULTIPLIER`
  - `GEMINI_429_COOLDOWN_SECONDS`
  - `GEMINI_429_COOLDOWN_MIN_CONSECUTIVE`
- legacy `GEMINI_LABEL_MODEL_NAME`이 존재하면 `gemini-2.5-flash`와 일치해야 한다. Pro primary drift는 실패로 처리한다.
- `SENTRY_DSN`은 비용과 이벤트 전송을 수반할 수 있으므로 필수 env에서 제외한다. Sentry를 사용하지 않는 운영에서는 비워두고 Render 로그와 smoke artifact로 확인한다.

## GitHub Actions

`.github/workflows/phase2-render-blueprint.yml`은 PR에서 dry-run을 실행한다. `.github/workflows/phase6-postdeploy-smoke.yml`은 live readiness를 먼저 실행하고, 통과한 경우에만 기존 Phase 6 post-deploy smoke를 실행한다.

GitHub environment secret 권장 이름:

- `RENDER_API_KEY`
- `RENDER_FOODLENS_API_SERVICE_ID`
- `RENDER_FOODLENS_WORKER_SERVICE_ID`
- `RENDER_FOODLENS_RETENTION_CRON_SERVICE_ID`
- `RENDER_EXPECTED_GCP_PROJECT_ID`
- `PHASE6_POSTDEPLOY_SMOKE_EMAIL`
- `PHASE6_POSTDEPLOY_SMOKE_PASSWORD`

## 잔여 리스크

- Render API 권한이 service 조회, service env 조회, deploy 조회를 허용하지 않으면 live gate는 실패한다. 이 경우 권한을 수정하고 재실행한다.
- `GCP_SERVICE_ACCOUNT_JSON`의 IAM 최소 권한, GCS lifecycle, GCP Budget alert 존재 여부는 Render env 조회만으로 검증할 수 없다. GCP Console 확인이 별도로 필요하다.
- post-deploy smoke는 smoke 계정에 유효한 profile/history media 또는 fresh upload 권한이 있어야 한다.
