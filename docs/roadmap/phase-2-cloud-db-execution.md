# Phase 2 실행표: 사용자 데이터 클라우드 DB 전환 (비개발자용)

이동: [Master Plan](./master-plan.md) | 이전: [Phase 1](./phase-1-login-session-execution.md) | 다음: [Phase 3](./phase-3-sync-conflict-execution.md)

## 1) 이 문서의 목적

- 지금 앱에 남아있는 "핸드폰 로컬 저장 중심" 구조를 "클라우드 DB 원본 + 로컬 캐시" 구조로 바꾸기 위한 실행표입니다.
- 비개발자도 진행률을 판단할 수 있도록, 주차별로 누가 무엇을 하는지 체크리스트로 정리했습니다.

## 2) Phase 2 최종 목표 (다시 확인)

- 프로필/알레르기/히스토리/설정 데이터를 서버 DB에 사용자 단위로 저장
- 로컬 저장은 임시 캐시 역할로 축소
- 기기 변경/앱 재설치 후 로그인 시 데이터 복원

## 3) 역할 정의 (Who)

- PM/PO: 범위 승인, 우선순위 조정, 수용 기준 승인
- Backend Lead: DB 스키마/API/마이그레이션 설계 및 구현
- Mobile Lead: 서버 연동 + 로컬 캐시 전략 + 동기화 처리
- QA: 데이터 일관성/복원 시나리오 전수 점검
- DevOps: DB/Render 환경 구성, 모니터링/백업 정책 적용

## 4) 주차별 실행표 (When / What)

### Week 1 (데이터 모델/계약 확정)

- PM/PO
  - 서버 원본으로 전환할 데이터 범위 확정
  - 제외 범위(다음 단계로 미루는 항목) 고정
- Backend Lead
  - DB 테이블/컬렉션 설계: users, profiles, allergies, scans, history, settings
  - API 계약 확정: 조회/저장/수정/삭제 필드 정의
- Mobile Lead
  - **Offline-First 설계**: 로컬 DB(SQLite)를 우선 읽기 소스로, 네트워크 호출은 백그라운드 동기화로 분리
  - 기존 로컬 키와 신규 서버 필드 매핑표 작성
  - 화면별 데이터 로딩 우선순위 (Local First -> Background Sync -> UI Update)
  - Optimistic UI(선반영) 전략 수립
- QA
  - 데이터 정합성 검증 시나리오 초안 작성
- 완료 체크
  - [ ] DB 모델 승인
  - [ ] API 계약 승인
  - [ ] Offline-First 아키텍처 설계 승인

### Week 2 (구현/연동)

- Backend Lead
  - `/me/profile`, `/me/allergies`, `/me/history`, `/me/settings` 구현
  - 사용자 소유권 검증(본인 데이터만 접근)
- Mobile Lead
  - 기존 로컬 저장 로직을 API 연동 중심으로 전환
  - 실패 시 캐시 fallback 및 재시도 처리
  - 로그인 사용자 변경 시 캐시 namespace 분리
- DevOps
  - DB 연결/권한/백업/환경변수 적용
  - 모니터링 지표 구성(에러율/지연시간)
- 완료 체크
  - [ ] CRUD 기본 플로우 동작
  - [ ] 캐시 fallback 동작
  - [ ] 서버 장애 시 앱 치명 중단 없음

### Week 3 (마이그레이션/안정화)

- Backend Lead + Mobile Lead
  - 기존 로컬 데이터 -> 서버 업로드 마이그레이션 경로 구현
  - 중복 방지 규칙(idempotency) 적용
- QA
  - 케이스 전수 점검:
    - 기존 사용자 업그레이드
    - 앱 삭제 후 재설치
    - 기기 변경 후 로그인
    - 계정 A/B 전환
- PM/PO
  - Go/No-Go 판단 및 사용자 공지 문구 확정
- 완료 체크
  - [ ] 데이터 유실 0건
  - [ ] 계정 간 데이터 섞임 0건
  - [ ] 복원 성공률 100%

## 5) 비개발자용 "주간 점검 질문" (매주 15분)

- Q1. 이번 주에 서버 원본으로 전환된 데이터는 무엇인가요?
- Q2. 아직 로컬에만 남은 데이터는 무엇이고, 언제 전환하나요?
- Q3. 기기 변경/재설치 테스트 결과는 어떤가요?
- Q4. 실패 시 롤백 방법과 사용자 영향 범위는 무엇인가요?

## 6) 수용 기준 (Definition of Done)

- 기능 기준:
  - 프로필/알레르기/히스토리/설정 서버 저장 성공
  - 서버 데이터 조회 기반 화면 렌더링 성공
  - 계정 전환 시 데이터 분리 성공
- 품질 기준:
  - 데이터 유실/중복 없음
  - request_id/user_id 기준 로그 추적 가능
  - 재설치/기기변경 복원 시나리오 통과

## 7) 리스크와 대응 (쉽게 설명)

- 리스크 1: 마이그레이션 중 데이터 누락
  - 대응: 업로드 전/후 카운트 비교 + 실패 재시도 큐
- 리스크 2: 계정 A 데이터가 B에 보이는 사고
  - 대응: 모든 API에 user ownership 강제 검증
- 리스크 3: 서버 장애 시 앱 사용성 저하
  - 대응: 읽기 캐시 fallback + 재시도 + 사용자 안내 문구

## 8) 이번 단계에서 하지 않는 것 (범위 보호)

- 동기화 충돌 고도화 정책(Phase 3에서 집중)
- AI 모델 운영 정책 확장(Phase 4에서 집중)
- 개인정보 삭제 실운영 자동화(Phase 5에서 집중)

---

문서 버전: v1.0  
연결 문서: [Master Plan](./master-plan.md), [Phase 1 실행표](./phase-1-login-session-execution.md), [API 계약 기준서](../contracts/api-contracts.md)  
최종 수정: 2026-02-19
