# Phase 6 실행표: 출시 게이트 상시 운영 (비개발자용)

이동: [Master Plan](./master-plan.md) | 이전: [Phase 5](./phase-5-privacy-security-deletion-execution.md)

## 1) 이 문서의 목적

- 기능을 빨리 넣는 것보다 "안정적으로 배포"하는 체계를 고정하는 단계입니다.
- 한 번 정하면 계속 반복 사용할 운영 습관(게이트)을 만드는 것이 목표입니다.

## 2) Phase 6 최종 목표 (다시 확인)

- 배포 전 품질 기준을 통과하지 못하면 출시하지 않음
- 릴리스 후 장애 대응/롤백이 빠르게 가능
- 팀이 동일한 체크리스트로 지속 운영

## 3) 역할 정의 (Who)

- PM/PO: 출시 승인 기준(Go/No-Go) 최종 결정
- Mobile Lead: 앱 빌드/회귀/스토어 준비
- Backend Lead: API 안정성/계약/운영 지표 검증
- QA: 릴리스 후보 전수 검증
- DevOps: 배포, 모니터링, 롤백 운영

## 4) 주차별 실행표 (When / What)

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
    - **Automated Regression**: 주요 플로우(로그인/검색) E2E 테스트 (Detox/Appium)
    - 스모크 테스트 (배포 직후 자동 실행)
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
  - 내부 테스트 트랙 배포 증적 고정:
    - Android AAB Internal Testing 1회 이상
    - iOS IPA(TestFlight Internal) 1회 이상
    - 운영 workflow: `.github/workflows/phase6-mobile-store-evidence.yml`
    - 증적 아티팩트: `FoodLens/artifacts/phase6/mobile-store-evidence/<timestamp>/`
- Mobile Lead
  - 릴리스 브랜치 전략 정리 (Git Flow/Trunk Based)
  - **Staged Rollout**: 1% -> 5% -> 20% -> 100% 점진적 배포 계획 수립
  - **Feature Flag** 도입: 문제 발생 시 앱 배포 없이 기능 원격 OFF
  - 운영값 고정:
    - `LABEL_ROLLOUT_ENABLED=1`
    - `LABEL_ROLLOUT_STAGE=general-100` (정상 운영 기본값)
    - 위험 기능 릴리스 시 단계값은 `shadow-1 -> canary-5 -> canary-20 -> general-100`
    - `LABEL_ROLLOUT_AUTO_ENABLED=0` (자동 승격 기본 비활성)
    - `LABEL_ROLLOUT_ROLLBACK_STAGE=rollback-0`
    - `LABEL_ROLLOUT_STATE_BACKEND=file`
    - `LABEL_ROLLOUT_STATE_PATH=/tmp/foodlens_rollout_state.json`
  - Kill switch 절차 고정:
    - 1차: `LABEL_ROLLOUT_ENABLED=0`
    - 2차: `LABEL_ROLLOUT_STAGE=rollback-0`
    - 3차: 적용 후 `phase6-postdeploy-smoke` 재실행으로 증적 보관
  - 앱 버전/빌드 넘버 규칙 고정
  - Android 제출 운영 원칙 고정:
    - 최초 1회는 Play Console 수동 제출 허용(예외)
    - 이후는 `eas submit` 자동 제출 + 재시도 절차 사용
- Backend Lead
  - 배포 전/후 스모크 스크립트 표준화
  - 운영 workflow: `.github/workflows/phase6-postdeploy-smoke.yml`
  - 증적 아티팩트: `FoodLens/artifacts/phase6/postdeploy-smoke/<timestamp>/`
  - 최소 점검 범위 고정:
    - `GET /`
    - Google/Kakao live provider redirect smoke
    - `GET /me/profile`
    - `GET /me/allergies`
    - `GET /me/settings`
    - `GET /me/history`
    - signed media render 1건
  - smoke 인증 입력 고정:
    - GitHub Actions secret `PHASE6_POSTDEPLOY_SMOKE_EMAIL`
    - GitHub Actions secret `PHASE6_POSTDEPLOY_SMOKE_PASSWORD`
    - workflow가 실행 시점에 자동 로그인 후 access token / signed media render URL을 동적으로 확보
  - 롤백 리허설 증적 입력 필수:
    - 최근 리허설 참조값
    - readiness verdict
    - 한 줄 요약
  - 주요 알림 기준 설정(에러율/지연/429)
- 완료 체크
  - [ ] CI에서 실패 시 배포 차단
  - [ ] 배포 후 스모크 자동/반자동 확인
  - [ ] rollout 단계값과 kill switch 값이 `render.yaml` / 런북 / smoke 증적에 일치
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
  - 실디바이스 런타임 로그 재확인:
    - `[SafeStorage] MMKV initialization failed` 발생 여부 기록
    - 발생 시 영향도(인증 토큰 경로 영향 여부) 판정
- 완료 체크
  - [ ] 릴리스 리허설 통과
  - [ ] 롤백 리허설 통과
  - [ ] 런북/연락 체계 문서화

## 5) 비개발자용 "주간 점검 질문" (매주 15분)

- Q1. 이번 주 릴리스 게이트에서 실패한 항목은 무엇인가요?
- Q2. 실패 항목은 언제 누구가 해결하나요?
- Q3. 릴리스 후 문제 발생 시 롤백 시간 목표는 몇 분인가요?
- Q4. 다음 릴리스에서 같은 문제가 반복되지 않게 무엇을 바꿨나요?

## 6) 수용 기준 (Definition of Done)

- 기능/품질 기준:
  - 필수 게이트(타입/계약/회귀/스모크) 통과
  - 치명 결함 0건
  - 릴리스 리허설 및 롤백 리허설 완료
- 운영 기준:
  - 모니터링/알림/런북 상시 운영
  - 문제 발생 시 담당자/연락 경로 명확
  - 내부 테스트 트랙 배포 증적(AAB/IPA, 로그/스크린샷/아티팩트) 보관
  - `eas submit` 자동 제출/재시도 로그 보관(최초 수동 제출 예외 사유 포함)
  - 배포 후 live smoke 증적(`summary.md`, endpoint logs, media render headers) 보관
  - 최근 rollback rehearsal 참조값과 readiness verdict 보관
  - MMKV 경고 재확인 결과(발생/미발생 + 영향도) 기록

## 7) 리스크와 대응 (쉽게 설명)

- 리스크 1: 일정 압박으로 게이트 우회
  - 대응: 우회 금지 원칙, 예외 승인 프로세스 명문화
- 리스크 2: 배포 후 장애 대응 지연
  - 대응: 롤백 버튼/절차 사전 검증 + 담당자 온콜
- 리스크 3: 테스트는 통과했는데 실제 장애 발생
  - 대응: 스모크 범위 확장 + 실제 트래픽 기반 모니터링 강화

## 8) 이번 단계에서 하지 않는 것 (범위 보호)

- 신규 대형 기능 개발
- 대규모 아키텍처 개편
- 외부 파트너 연동 확장

---

문서 버전: v1.0  
연결 문서: [Master Plan](./master-plan.md), [Phase 5 실행표](./phase-5-privacy-security-deletion-execution.md), [API 계약 기준서](../contracts/api-contracts.md)  
최종 수정: 2026-02-19
