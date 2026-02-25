# DB Cutover Runbook: Local Docker Postgres -> Render Managed PostgreSQL

## 1) 목적

- Phase 2에서 개발 DB(Local Docker Postgres)에서 운영/검증 DB(Render 유료 Postgres)로 안전하게 전환하기 위한 표준 절차입니다.
- 목표는 데이터 유실 0, 다운타임 최소화, 실패 시 즉시 롤백입니다.

## 2) 관련 파일 경로

- `docs/ops/db-cutover-local-to-render-postgres.md`
- `docs/roadmap/cloud-decision-record.md`
- `docs/roadmap/phase-2-cloud-db-execution.md`
- `docs/roadmap/phase-2-validation-context-prompt.md`
- `docs/roadmap/master-plan.md`
- `.env.example`
- `FoodLens/.env.example`

## 3) 사전 조건

- Render 유료 PostgreSQL 인스턴스 생성 완료
- 애플리케이션 마이그레이션 스크립트 준비 완료
- 컷오버 시간대 공지(쓰기 트래픽 최소 구간)
- 백업 파일 저장 경로와 담당자 지정

## 4) 환경변수 기준

- 백엔드:
  - `DATABASE_URL` 하나만 활성값으로 사용
  - 로컬 개발: `postgresql://...@127.0.0.1:5432/...`
  - Render: `postgresql://...:5432/...?...sslmode=require`
- 모바일:
  - `EXPO_PUBLIC_ANALYSIS_SERVER_URL`를 실제 백엔드 도메인으로 유지
  - Release 테스트는 URL 변경 시 재빌드 필요

## 5) 컷오버 절차

1. 쓰기 제한(maintenance mode 또는 쓰기 API 임시 차단)
2. 로컬 DB 백업 덤프 생성
3. Render DB에 스키마 마이그레이션 적용
4. 덤프를 Render DB에 복원
5. 서버 `DATABASE_URL`을 Render DB로 전환 후 배포
6. 서비스 헬스체크 및 인증/세션 스모크 실행
7. `/me/profile`, `/me/allergies`, `/me/history`, `/me/settings` 검증
8. 쓰기 제한 해제

## 6) 예시 명령 (운영 전 사전 검증 필수)

```bash
# 1) Local dump
docker exec -t <local_pg_container> pg_dump -U <local_user> -d <local_db> -Fc > local.dump

# 2) Restore to Render Postgres
pg_restore --no-owner --no-privileges --clean --if-exists --dbname="<RENDER_DATABASE_URL>" local.dump
```

## 7) 롤백

1. `DATABASE_URL`을 컷오버 이전 값으로 즉시 복귀
2. 이전 백업 기준으로 로컬/대체 DB 상태 재복원
3. 헬스체크 + 핵심 API 스모크 재실행
4. 장애 원인 분석 후 재시도 시점 재승인

## 8) 검증 체크리스트

- [ ] 로그인/세션 복구 정상
- [ ] `/me/profile` 조회/수정 정상
- [ ] `/me/allergies` 조회/수정 정상
- [ ] `/me/settings` 조회/수정 정상
- [ ] `/me/history` 조회/추가 정상(idempotency 확인)
- [ ] request_id/user_id 로그 추적 가능
- [ ] 앱 삭제/재설치 후 로그인 복원 확인(iOS/Android)
- [ ] 계정 A/B 전환 데이터 분리 확인

## 9) 증적 보관

- 백업 파일 해시, 복원 로그, 스모크 로그, 실패/롤백 로그를 릴리스 증적에 첨부
- 문서 업데이트:
  - `docs/roadmap/cloud-decision-record.md`
  - `docs/roadmap/phase-2-cloud-db-execution.md`
  - `docs/roadmap/phase-2-validation-context-prompt.md`
