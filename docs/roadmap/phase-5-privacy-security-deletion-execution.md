# Phase 5 실행표: 개인정보/보안/삭제 체계 (비개발자용)

이동: [Master Plan](./master-plan.md) | 이전: [Phase 4](./phase-4-ai-ops-execution.md) | 다음: [Phase 6](./phase-6-release-gate-execution.md)

## 1) 이 문서의 목적

- 서비스 운영 시 가장 중요한 "개인정보 보호, 보존기간, 삭제 요청 처리"를 실제로 동작하게 만드는 단계입니다.
- 법무/신뢰/운영 리스크를 줄이기 위해, 누가 언제 무엇을 해야 하는지 정리합니다.

## 2) Phase 5 최종 목표 (다시 확인)

- 개인정보 최소수집 원칙 적용
- 데이터 보존기간(TTL) 정책 적용
- 계정 삭제/데이터 삭제 요청을 실제 처리 가능

## 3) 역할 정의 (Who)

- PM/PO: 개인정보 정책/사용자 고지 문구 승인
- Backend Lead: TTL/삭제 큐/삭제 API 구현
- Mobile Lead: 삭제 요청 UI/상태 안내/확인 플로우 구현
- QA: 삭제 요청 전/후 데이터 상태 전수 검증
- DevOps: 보존/백업/삭제 배치 운영 및 감사 로그 관리

## 4) 주차별 실행표 (When / What)

### Week 1 (정책/범위 확정)

- PM/PO
  - 수집 항목 분류 (Data Minimization 원칙):
    - 필수 수집: 서비스 제공에 불가피한 최소 정보
    - 선택 수집: 마케팅/부가기능 (별도 동의 필수)
    - **Third-Party Data Tracking**: 분석/광고 SDK 수집 항목 전수 조사 및 명시
  - 보존기간 정책 승인 (원본/파생/로그)
  - Google Play 계정 삭제 고지 승인:
    - 앱 내 계정 삭제 요청 경로
    - 앱을 재설치하지 않아도 요청 가능한 외부 웹 삭제 경로
    - 법적/보안/부정사용 방지 목적으로 보존하는 데이터와 보존기간
- Backend Lead
  - 데이터 삭제 범위 정의:
    - 즉시 삭제 대상
    - 지연 삭제 대상
    - 법적 보존 대상(있는 경우)
- Mobile Lead
  - "데이터 삭제 요청" 화면/문구 설계
  - Google Play Data safety 삭제 링크와 일관된 앱 내 삭제 진입점 설계
- QA
  - 삭제 검증 시나리오 설계
- 완료 체크
  - [ ] 보존/삭제 정책 승인
  - [ ] 삭제 범위 확정
  - [ ] 사용자 안내 문구 승인

### Week 2 (구현/연동)

- Backend Lead
  - 삭제 큐 producer/consumer 구현
  - `user_id` 기준 삭제 API 연결
  - TTL 만료 정리 작업(배치/잡) 적용
  - 계약 고정:
    - `POST /me/deletion-requests` (`target=account|data`)
    - `GET /me/deletion-requests/latest`
    - 상태값 `pending|in_progress|done|failed`
- Mobile Lead
  - 계정 삭제/데이터 삭제 요청 UI 연결
  - 삭제 진행 상태 표시(접수/진행/완료/실패)
- DevOps
  - 삭제 배치 스케줄 운영
  - 실패 알림/재처리 경로 구성
- 완료 체크
  - [ ] 삭제 요청 접수 성공
  - [ ] 큐 처리 후 실제 삭제 확인
  - [ ] TTL 만료 데이터 정리 동작 확인
  - [ ] Play Console Data safety 삭제 질문, 개인정보처리방침, 외부 웹 삭제 링크가 실제 처리 경로와 일치

### Week 3 (검증/감사 대비)

- QA
  - 전수 점검:
    - 삭제 요청 직후 조회 불가
    - 재로그인 후 데이터 복원 안 됨(삭제된 경우)
    - 로그/캐시에 민감정보 잔존 없음
- Backend Lead + DevOps
  - 감사 로그 형식 정리 (누가/언제/무엇 삭제)
  - 실패 케이스 재처리 보강
- PM/PO
  - Go/No-Go 판단
- 완료 체크
  - [ ] 삭제 요청 SLA 내 처리
  - [ ] 민감 데이터 잔존 0건
  - [ ] 운영 대응 문서화 완료

## 5) 비개발자용 "주간 점검 질문" (매주 15분)

- Q1. 사용자 삭제 요청이 실제로 처리되었나요?
- Q2. 삭제 후에도 남아 있는 데이터는 없나요?
- Q3. 보존기간 지난 데이터는 자동 정리되나요?
- Q4. 문제가 생기면 누가 어떤 순서로 대응하나요?

## 6) 수용 기준 (Definition of Done)

- 기능 기준:
  - 계정/데이터 삭제 요청 접수 가능
  - 삭제 큐 처리로 실제 데이터 삭제
  - TTL 만료 데이터 자동 정리
  - Google Play 계정 삭제 요구사항에 맞는 앱 내/외부 요청 경로 제공
- 품질 기준:
  - 삭제 후 조회 불가 보장
  - 감사 로그 추적 가능
  - 민감정보 로그 노출 없음
  - 개인정보처리방침과 Data safety 표기가 실제 수집/삭제/보존 동작과 일치

## 6-1) 현재 계약 기준 메모

- 삭제 요청 API:
  - `POST /me/deletion-requests`
    - 요청 본문: `target` (`account` | `data`)
    - 응답 본문: `deletion_request { queue_id, target, status, created_at, updated_at, reason, error, retry_count, next_attempt_at }`, `request_id`
  - `GET /me/deletion-requests/latest`
    - 최근 삭제 요청 상태를 조회하며, 요청이 없으면 `deletion_request: null`, `request_id`
- 삭제 의미:
  - `data`: 계정은 유지, 사용자 데이터와 개인화 상태를 초기화
  - `account`: 계정 자체를 제거하고 세션까지 무효화
- TTL 기본값:
  - 원본(original) `30일`
  - 파생(derived) `90일`
  - 로그(log) `14일`
- 운영 루프:
  - retention cleanup loop가 TTL 만료 데이터를 정리
  - deletion queue loop가 사용자 삭제 요청을 처리
- 비동기 분석 작업:
  - `analysis_jobs`에는 작업 처리를 위해 이미지/알러지/분석 결과 필드가 남을 수 있다.
  - 기존 잔존 데이터 또는 오래된 anonymous/device/ip scoped 작업은 [Analysis Jobs Privacy Backfill Runbook](../ops/analysis-jobs-privacy-backfill-runbook.md)에 따라 dry-run 검토 후 scrub한다.
  - TTL 만료 payload scrub 운영은 [Analysis Jobs TTL Scrub Rollout](../ops/analysis-jobs-ttl-scrub-rollout.md)에 따라 live env parity, dry-run count, execute 승인 기준을 확인한다.

## 6-2) 현재 최소수집·제3자 연동 증적

- 현재 저장소 기준 최소수집 및 제3자 연동 인벤토리: [Phase 5 최소수집 및 제3자 연동 인벤토리](../security/phase-5-data-minimization-and-third-party-inventory.md)
- 이 문서를 기준으로 필수 수집, 비수집 항목, 제3자 전송 목적, TTL/삭제 통제를 함께 검토한다.

## 7) 리스크와 대응 (쉽게 설명)

- 리스크 1: 삭제 요청했는데 일부 데이터가 남음
  - 대응: 삭제 대상 체크리스트 + 배치 검증 리포트
- 리스크 2: 삭제 처리 지연
  - 대응: SLA 기준 알림 + 재처리 큐
- 리스크 3: 로그에 민감정보 잔존
  - 대응: 로그 마스킹 + 정기 스캔

## 8) 이번 단계에서 하지 않는 것 (범위 보호)

- 신규 기능 UI 확장
- AI 모델 성능 개선 작업
- 인증 공급자 추가/변경

---

문서 버전: v1.1
연결 문서: [Master Plan](./master-plan.md), [Phase 4 실행표](./phase-4-ai-ops-execution.md), [API 계약 기준서](../contracts/api-contracts.md)  
최종 수정: 2026-03-29
