# Phase 6 실행표: 출시 게이트 상시 운영 (비개발자용)

이동: [Master Plan](./master-plan.md) | 이전: [Phase 5](./phase-5-privacy-security-deletion-execution.md)

## 1) 이 문서의 목적

- 기능을 빨리 넣는 것보다 "안정적으로 배포"하는 체계를 고정하는 단계입니다.
- 한 번 정하면 계속 반복 사용할 운영 습관(게이트)을 만드는 것이 목표입니다.

## 2) 현재 상태 (2026-05-17 기준)

- Android release gate: **Go 승인 완료**
- Android: Play Console 내부 테스트 수동 업로드 단계
- iOS: 앱 자산/스플래시/실기기 release 검증은 진행했지만, 스토어 배포는 Apple 배포 등록 후 진행
- backend post-deploy smoke:
  - `workflow_dispatch` 기반 반자동 실행
  - 실행 시점에 테스트 계정으로 자동 로그인하여 token / signed media render URL을 동적으로 확보
  - `POST /analyze/jobs` submit -> poll terminal status 증적까지 함께 수집
- rollback rehearsal:
  - kill switch 값 변경 후 smoke(analysis jobs 포함) 재실행으로 증적 보관

## 3) Phase 6 최종 목표 (다시 확인)

- 배포 전 품질 기준을 통과하지 못하면 출시하지 않음
- 릴리스 후 장애 대응/롤백이 빠르게 가능
- 팀이 동일한 체크리스트로 지속 운영

## 4) 역할 정의 (Who)

- PM/PO: 출시 승인 기준(Go/No-Go) 최종 결정
- Mobile Lead: 앱 빌드/회귀/스토어 준비
- Backend Lead: API 안정성/계약/운영 지표 검증
- QA: 릴리스 후보 전수 검증
- DevOps: 배포, 모니터링, 롤백 운영

## 5) 주차별 실행표 (When / What)

### Week 1 (게이트 정의 고정)

- PM/PO
  - 출시 승인 기준 정의:
    - 치명 버그 0건
    - 계약 테스트 통과
    - 핵심 시나리오 통과
- Mobile Lead + Backend Lead
  - 필수 게이트 명시:
    - 타입 검사 (TypeScript/Lint)
    - 계약 테스트 (Pact/Schema Validation)
    - Automated Regression
    - Mobile bundle/image/runtime performance gate
    - Backend media performance regression baseline 비교
    - 배포 직후 smoke workflow
- QA
  - 릴리스 전수 시나리오 체크리스트 확정
- 완료 체크
  - [ ] 출시 게이트 문서 승인
  - [ ] Go/No-Go 기준 승인
  - [ ] QA 체크리스트 승인

### Week 2 (자동화/운영 적용)

- DevOps
  - CI 파이프라인에 게이트 연결
  - 실패 시 머지/배포 차단 규칙 적용
  - backend media performance regression을 PR 필수 컨텍스트로 등록:
    - workflow: `.github/workflows/backend-media-performance-regression.yml`
    - 기준선: `PERF_BASELINE_SUMMARY_PATH` 또는 `PERF_BASELINE_SUMMARY_ARTIFACT_RUN_ID` / `PERF_BASELINE_SUMMARY_ARTIFACT_NAME`
    - 기준선 누락 시 비교 skip 금지, workflow 실패
  - mobile bundle size workflow를 PR 필수 컨텍스트로 등록:
    - workflow: `.github/workflows/mobile-bundle-size.yml`
    - 핵심 이미지 품질 gate: `npm run asset:image:quality:gate`
    - History 300/1000개 fixture runtime gate: `npm run history:runtime:gate`
    - 번들 크기 gate: `npm run bundle:size:gate`
    - 로컬 통합 재현 명령: `npm run phase6:mobile-performance:gate`
    - 통합 재현 명령은 `--require-fresh-export`로 번들 gate를 호출하므로 `MOBILE_BUNDLE_SKIP_EXPORT=1` 환경변수가 남아 있어도 fresh export를 강제
    - 오래된 export 재검사는 로컬 진단에서만 `npm run bundle:size:gate -- --skip-export --allow-stale-export` 사용
    - CI/PR 필수 컨텍스트에서는 `--skip-export` 사용 금지, 매 실행마다 fresh export 생성
    - 증적 아티팩트: `FoodLens/artifacts/phase6/mobile-bundle-size/`
    - bundle summary의 `exportMode`가 `fresh-export`인지 확인
  - mobile E2E release gate를 릴리스 후보 검증 명령으로 등록:
    - workflow: `.github/workflows/mobile-e2e-release-gate.yml`
    - PR 필수 컨텍스트: `mobile-e2e`
    - 로컬/CI 재현 명령: `npm run phase6:mobile-e2e:gate`
    - 릴리스 증적 필수 로컬 재현 명령: `npm run phase6:mobile-e2e:release-gate`
    - 자동화 범위: login/session, scan 분석 진입, result 저장/리포트, history 조회/이동
    - 증적 아티팩트: `FoodLens/artifacts/phase6/mobile-e2e-release-gate/`
    - `workflow_dispatch` 수동 실행은 workflow 파일이 default branch(`main`)에 merge된 뒤부터 가능
    - default branch merge 전 검증 경로는 PR의 `mobile-e2e` check와 로컬 재현 명령으로 고정
    - `docs/scripts/apply_branch_protection.sh`는 default branch에 workflow 파일이 확인된 뒤 `mobile-e2e`를 필수 컨텍스트로 등록
    - `gate-manifest.json`의 `deviceRunnerConfigured=false`는 Detox/Maestro/Appium 같은 실디바이스 자동화 러너가 아직 없다는 뜻
    - 모든 실행은 `real-device-evidence.json`에 iOS/Android 실디바이스 증적 상태를 기록
    - 일반 PR에서는 실디바이스 증적이 없어도 Jest 기반 smoke gate만 실행
    - `release/**` 브랜치 push 또는 `workflow_dispatch`에서 `require_real_device_evidence=true`인 실행은 iOS/Android 증적 URI가 없으면 실패
    - 증적 URI 입력값:
      - `MOBILE_E2E_IOS_REAL_DEVICE_EVIDENCE_URI`
      - `MOBILE_E2E_ANDROID_REAL_DEVICE_EVIDENCE_URI`
    - 증적 URI는 GitHub Actions artifact, TestFlight/Play Internal Testing 결과, 또는 수동 QA 리포트 링크 중 하나를 사용
    - 선택 입력값:
      - `MOBILE_E2E_IOS_REAL_DEVICE_RUNNER`
      - `MOBILE_E2E_ANDROID_REAL_DEVICE_RUNNER`
  - staging integration smoke를 보호 규칙에 연결:
    - workflow: `.github/workflows/staging-integration-smoke.yml`
    - PR 필수 컨텍스트: `staging-integration-smoke-pr-check`
    - PR에서는 workflow 구조, staging environment, Render secret 참조, artifact secret scan 순서를 검증
    - 실제 staging deploy는 main/release에서 수동 실행한 workflow_dispatch에서만 직접 트리거한다
    - 수동 실행도 Render free build minutes를 사용하므로, 필요한 경우에만 실행하고 같은 ref의 중복 실행은 concurrency로 취소한다
    - staging deploy trigger/readiness summary는 production service name, non-free plan, unexpected service name, service type/repo/branch/autoDeploy drift이면 실패
    - 증적 아티팩트: `artifacts/phase6/staging-integration-smoke/`
  - `release/**` 브랜치 ruleset을 적용:
    - 스크립트: `docs/scripts/apply_release_branch_ruleset.py`
    - 대상 ref: `refs/heads/release/**`
    - 요구 정책: PR 기반 업데이트, stale review dismiss, unresolved conversation 차단, non-fast-forward 차단
    - 필수 체크: main 보호 규칙과 동일한 품질 게이트(`backend-media-performance-regression`, `bundle-size`, `mobile-e2e`, `staging-integration-smoke-pr-check` 포함)
    - release 브랜치 최초 생성은 `do_not_enforce_on_create=true`로 허용하고, 이후 업데이트는 필수 체크 통과 상태로만 허용
  - 내부 테스트 트랙 배포 증적 고정:
    - Android AAB Internal Testing 1회 이상
    - iOS IPA(TestFlight Internal) 1회 이상
    - 운영 workflow: `.github/workflows/phase6-mobile-store-evidence.yml`
    - 증적 아티팩트: `FoodLens/artifacts/phase6/mobile-store-evidence/<timestamp>/`
- Mobile Lead
  - 릴리스 브랜치 전략 정리
  - staged rollout 계획 수립: `1% -> 5% -> 20% -> 100%`
  - feature flag / kill switch 절차 고정
  - Android 제출 운영 원칙:
    - 최초 1회는 Play Console 수동 제출 허용
    - Play Console 수동 제출 화면에서 기존 APK와 새 AAB/APK를 같은 draft release에 섞지 않는다.
    - 예: `versionCode=21` AAB를 올릴 때 `versionCode=18` APK가 같은 draft에 남아 있으면 새 버전이 낮은 APK를 완전히 대체해 저장이 차단되므로, 낮은 versionCode APK를 draft에서 삭제하거나 새 release를 만든다.
    - 수동 제출 전 Play release state JSON을 준비한 경우 `PHASE6_PLAY_RELEASE_STATE_PATH=<path> npm run release:play-track-state:gate`로 stale APK 혼입을 검증한다.
    - 난독화 매핑 파일 경고는 R8/proguard 난독화를 켠 경우에만 Play Console에 mapping file을 업로드하고, 난독화 미사용 빌드에서는 출시 차단 오류로 보지 않는다.
    - 이후는 `eas submit` 자동 제출 + 재시도 절차 사용
  - Phase6 Mobile Store Evidence workflow 입력 고정:
    - 스토어 제출 증적 URI와 빌드 프로필을 입력으로 사용
    - 광고 SDK 관련 secret은 요구하지 않는다.
- Backend Lead
  - 배포 전/후 smoke 스크립트 표준화
  - 운영 workflow: `.github/workflows/phase6-postdeploy-smoke.yml`
  - 증적 아티팩트: `FoodLens/artifacts/phase6/postdeploy-smoke/<timestamp>/`
  - 최소 점검 범위 고정:
    - `GET /`
    - Google/Kakao provider redirect smoke
    - `GET /me/profile`
    - `GET /me/allergies`
    - `GET /me/settings`
    - `GET /me/history`
    - 기존 signed media render 1건
    - fresh media upload 기반 cold render 1건: `X-Media-Render-Cache=miss`, `X-Media-Render-Stage-Ms` 필수 key 확인
    - 동일 fresh render URL 재요청 1건: `X-Media-Render-Cache=hit` 확인
    - smoke가 업로드한 fresh media asset cleanup 1건: owner-scoped delete 성공 확인
    - `POST /analyze/jobs` (`mode=food`) submit -> `completed|fallback_completed` terminal poll 1건
  - smoke 인증 입력 고정:
    - GitHub Actions secret `PHASE6_POSTDEPLOY_SMOKE_EMAIL`
    - GitHub Actions secret `PHASE6_POSTDEPLOY_SMOKE_PASSWORD`
    - workflow가 실행 시점에 자동 로그인 후 access token / signed media render URL을 동적으로 확보
  - Render live env checker 고정:
    - `python .github/scripts/validate_render_live_env.py --blueprint render.yaml`
    - 기본 검증 범위는 Google OAuth prompt, AI 모델명, label fallback, Pro fallback guardrail, auth/analysis rate limit, deletion retry, analysis_jobs TTL scrub key를 포함하고, 전체 drift audit는 `--all-blueprint-env`로 별도 실행한다.
    - 출력은 서비스명, key 이름, 존재 여부, blueprint 일치 여부만 포함하고 실제 env 값은 출력하지 않는다.
    - `GEMINI_LABEL_PRO_FALLBACK_ENABLED=0`, `LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK`, `LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER`, `ANALYSIS_JOBS_TTL_SCRUB_ENABLED`, `ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN`, `ANALYSIS_JOBS_TTL_SCRUB_DAYS`, `ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE`가 `foodlens-api`, `foodlens-worker`, `foodlens-retention-cron`에 모두 반영되어야 rollout을 진행한다.
  - rollback rehearsal 증적 입력 필수:
    - 최근 리허설 참조값
    - readiness verdict
    - 한 줄 요약
- 완료 체크
  - [ ] CI에서 실패 시 배포 차단
  - [ ] mobile bundle/image/runtime performance gate 통과
  - [ ] mobile E2E release gate 통과 및 iOS/Android 실디바이스 증적 첨부
  - [ ] backend media performance regression baseline 비교 통과
  - [ ] staging integration smoke PR 컨텍스트와 수동 workflow_dispatch 증적 통과
  - [ ] `release/**` branch ruleset 적용 및 필수 체크 목록 확인
  - [ ] 배포 후 smoke workflow 실행 경로 확정
  - [ ] rollout 단계값과 kill switch 값이 `render.yaml` / 런북 / smoke 증적에 일치
  - [ ] smoke summary에 analyze-jobs `job_id` 와 terminal status가 포함
  - [ ] 알림 채널 정상 동작

### Week 3 (리허설/내재화)

- QA
  - 릴리스 리허설 1회 이상 실행
  - 회귀 결과 보고서 제출
- PM/PO + Tech Leads
  - Go/No-Go 회의 템플릿 운영
  - 롤백 리허설 1회 실행
- DevOps
  - 운영 대시보드/런북 정리
  - 실디바이스 런타임 로그 재확인
- 완료 체크
  - [ ] 릴리스 리허설 통과
  - [ ] 롤백 리허설 통과
  - [ ] 런북/연락 체계 문서화

## 6) 운영값 기준

- 정상 운영 기본값:
  - `LABEL_ROLLOUT_ENABLED=1`
  - `LABEL_ROLLOUT_STAGE=general-100`
  - `LABEL_ROLLOUT_AUTO_ENABLED=0`
  - `LABEL_ROLLOUT_ROLLBACK_STAGE=rollback-0`
  - `LABEL_ROLLOUT_STATE_BACKEND=file`
  - `LABEL_ROLLOUT_STATE_PATH=/tmp/foodlens_rollout_state.json`
- kill switch 절차:
  - 1차: `LABEL_ROLLOUT_ENABLED=0`
  - 2차: `LABEL_ROLLOUT_STAGE=rollback-0`
  - 3차: Render live env checker로 Pro fallback 차단값 `GEMINI_LABEL_PRO_FALLBACK_ENABLED=0` 유지 확인
  - 4차: 적용 후 `phase6-postdeploy-smoke` 재실행

## 7) 비개발자용 주간 점검 질문

- 이번 주 릴리스 게이트에서 실패한 항목은 무엇인가요?
- 실패 항목은 언제 누구가 해결하나요?
- 릴리스 후 문제 발생 시 롤백 시간 목표는 몇 분인가요?
- 다음 릴리스에서 같은 문제가 반복되지 않게 무엇을 바꿨나요?

## 8) 수용 기준 (Definition of Done)

- 기능/품질 기준
  - 필수 게이트(타입/계약/회귀/smoke) 통과
  - mobile bundle/image/runtime performance gate 통과 및 artifact 보관
  - mobile E2E release gate 통과 및 iOS/Android 실디바이스 증적 보관
  - backend media performance regression 기준선 비교 통과 및 artifact 보관
  - 치명 결함 0건
  - 릴리스 리허설 및 롤백 리허설 완료
- 운영 기준
  - 모니터링/알림/런북 상시 운영
  - 내부 테스트 트랙 배포 증적 보관
  - `eas submit` 자동 제출/재시도 로그 보관(최초 수동 제출 예외 사유 포함)
  - 배포 후 live smoke 증적(`summary.md`, endpoint logs, media render cache/stage headers, analyze-jobs submit/poll evidence) 보관
  - 최근 rollback rehearsal 참조값과 readiness verdict 보관

## 9) 리스크와 대응

- 리스크 1: 일정 압박으로 게이트 우회
  - 대응: 우회 금지 원칙, 예외 승인 프로세스 명문화
- 리스크 2: 배포 후 장애 대응 지연
  - 대응: 롤백 절차 사전 검증 + 담당자 온콜
- 리스크 3: 테스트는 통과했는데 실제 장애 발생
  - 대응: smoke 범위 확장 + 실제 트래픽 기반 모니터링 강화

## 10) 이번 단계에서 하지 않는 것

- 신규 대형 기능 개발
- 대규모 아키텍처 개편
- 외부 파트너 연동 확장

---

문서 버전: v1.3
연결 문서: [Master Plan](./master-plan.md), [API 계약 기준서](../contracts/api-contracts.md), [아키텍처 요약](../architecture-overview.md)
최종 수정: 2026-05-17
