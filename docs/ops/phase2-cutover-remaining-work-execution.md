# Phase 2 Cutover 잔여 작업 실행 가이드 (PARTIAL -> PASS)

## 1) 목적

- 현재 `docs/roadmap/phase-2-cutover-rehearsal-evidence.md`의 `PARTIAL` 상태를 `PASS`로 전환하기 위한 실행 가이드입니다.
- 범위는 "Render 측 네트워크 경로에서 복원 리허설 1회 성공 + 증적 고정"입니다.

## 2) 절대 원칙

- 운영 DB에 직접 복원 리허설을 수행하지 않습니다.
- 복원 리허설은 반드시 **staging/clone DB**에서 수행합니다.
- 리허설 중 모든 명령의 stdout/stderr와 종료코드를 파일로 남깁니다.

## 3) 완료 기준 (PASS 조건)

- `pg_restore` 종료코드 `0` 증적 확보
- 복원 직후 검증 쿼리 성공 증적 확보
  - `select now();`
  - `select count(*) from auth_runtime_state;`
- `/me/profile`, `/me/allergies`, `/me/settings`, `/me/history` 스모크 로그 확보
- 롤백(되돌리기) 리허설 로그 확보
- 위 증적 반영 후 `docs/roadmap/phase-2-cutover-rehearsal-evidence.md` Verdict를 `PASS`로 갱신

## 4) 실행 순서

1. 리허설 대상 DB 확정
   - staging 또는 production clone DB URL 사용
   - 체크: DB 이름/호스트가 운영 DB와 다른지 확인

2. 로컬 백업/로컬 복원 리허설 실행
   - 기존 스크립트 사용:
   - `bash backend/scripts/phase2_cutover_rehearsal.sh`
   - 산출물: `artifacts/phase2/local-*`

3. Render 측 네트워크 경로에서 복원 리허설 실행
   - 방법 A(권장): Render One-off Job
   - 방법 B: Render Web Service Shell
   - 핵심: `pg_restore`를 Render 내부 네트워크 경로에서 실행

4. 복원 직후 검증 쿼리 실행 및 로그 저장
   - `select now();`
   - `select count(*) from auth_runtime_state;`

5. API 스모크 실행 및 로그 저장
   - `/me/profile`, `/me/allergies`, `/me/settings`, `/me/history`
   - request_id/user_id 추적 가능 로그 포함

6. 롤백 리허설 수행
   - 복원 전 상태로 되돌리는 명령/결과를 로그로 저장

7. 증적 문서 갱신
   - `docs/roadmap/phase-2-cutover-rehearsal-evidence.md`에 최신 실행 결과/아티팩트 경로/최종 Verdict 반영

## 5) 증적 파일 템플릿

- 실행 타임스탬프: `YYYYMMDD-HHMMSS` (예: `20260301-223000`)
- 저장 경로: `artifacts/phase2/`

- 필수 파일:
  - `render-restore-attempt-<TS>.log`
  - `render-restore-exit-<TS>.txt`
  - `render-post-restore-verify-<TS>.log`
  - `render-api-smoke-me-endpoints-<TS>.log`
  - `render-rollback-rehearsal-<TS>.log`
  - `cutover-remaining-work-<TS>.summary`

- `render-restore-exit-<TS>.txt` 예시:
  - `pg_restore_exit=0`

- `cutover-remaining-work-<TS>.summary` 권장 항목:
  - run_ts
  - rehearsal_db_target(masked)
  - pg_restore_exit
  - post_restore_verify(select now/count) status
  - me_endpoints_smoke status
  - rollback_rehearsal status
  - final_verdict (PASS/FAIL)

## 6) 위험/실패 처리

- `pg_restore` 실패 시:
  - 즉시 중단
  - 동일 시점의 전체 로그 보존
  - 원인(권한/SSL/네트워크/락) 분류 후 재시도

- 검증 쿼리 실패 시:
  - 복원 성공으로 판정하지 않음
  - DB 연결/권한/스키마 상태 재확인 후 재수행

## 7) 문서 반영 체크

- [ ] `docs/roadmap/phase-2-cutover-rehearsal-evidence.md` 최신 실행 타임스탬프 반영
- [ ] 아티팩트 파일 경로 나열
- [ ] Follow-up Required 항목 제거 또는 완료 표시
- [ ] Verdict `PASS` 반영

