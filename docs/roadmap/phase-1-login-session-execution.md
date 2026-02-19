# Phase 1 실행표: 로그인/세션 체계 확정 (비개발자용)

이동: [Master Plan](./master-plan.md) | 다음: [Phase 2](./phase-2-cloud-db-execution.md)

## 1) 이 문서의 목적

- "누가, 언제, 무엇을" 할지 주차 단위로 명확히 정리합니다.
- 비개발자도 진행상황을 눈으로 확인할 수 있도록 체크리스트 중심으로 작성했습니다.

## 2) Phase 1 최종 목표 (다시 확인)

- Google/Kakao/Email 로그인 동작
- 로그인 사용자 기준으로 데이터가 섞이지 않음
- 로그아웃/재로그인/계정전환 시 사용자 데이터 분리 100%

## 3) 역할 정의 (Who)

- PM/PO: 우선순위, 범위 고정, 수용 기준 승인
- Mobile Lead: 앱 로그인 UI/세션 저장/화면 가드
- Backend Lead: 인증 API/토큰 정책/보안 검증
- QA: 수동 시나리오 점검 및 결함 리포트
- DevOps: Render 환경변수/배포 검증/로그 확인

## 4) 주차별 실행표 (When / What)

### Week 1 (설계/계약 고정 주간)

- PM/PO
  - 로그인 방식 범위 확정: Google/Kakao/Email
  - "이번 단계에서 하지 않을 것" 명시 (범위 통제)
- Backend Lead
  - 인증 API 계약 확정 (`/auth/*`)
  - 토큰 정책(만료/갱신/폐기) 문서화
- Mobile Lead
  - 로그인 화면 플로우 와이어 확정
  - 앱 전역 사용자 식별 소스(auth 결과) 단일화 설계
- QA
  - 테스트 시나리오 초안 작성 (로그인/로그아웃/계정전환)
- 완료 체크
  - [ ] API 계약 문서 리뷰 완료
  - [ ] 와이어/플로우 승인 완료
  - [ ] 테스트 시나리오 초안 승인

### Week 2 (개발 주간)

- Backend Lead
  - Google/Kakao/Email 로그인 API 구현
  - **Refresh Token Rotation** 도입: 갱신 시 구 토큰 폐기 및 재사용 감지
  - Access Token 수명 단축 (15-30분) 및 Refresh Token 수명 설정 (7-30일)
  - 최소 보안 검증(PKCE, HTTPS 강제)
- Mobile Lead
  - 로그인/회원가입 화면 연결
  - **Secure Storage** 적용: Access/Refresh Token을 Keychain(iOS)/Keystore(Android)에만 저장
  - 앱 재실행 시 세션 유효성 백그라운드 체크 및 자동 갱신
  - 로그아웃 시 로컬 세션 및 토큰 안전 삭제
- DevOps
  - Render 환경변수 설정 (클라이언트 키/시크릿)
  - 개발/스테이징 배포
- 완료 체크
  - [ ] 로그인 3종 성공
  - [ ] refresh/logout 동작
  - [ ] 앱 재실행 후 세션 복구 확인

### Week 3 (통합/안정화 주간)

- QA
  - 계정 A/B 전환 시 데이터 분리 확인
  - 네트워크 불안정 상황 재시도/오류 메시지 검증
- Mobile Lead + Backend Lead
  - 오류코드/오류문구 통일
  - 회귀 이슈 수정
- PM/PO
  - Go/No-Go 판단
- 완료 체크
  - [ ] 데이터 섞임 0건
  - [ ] 치명 버그 0건
  - [ ] 릴리스 체크리스트 통과

## 5) 비개발자용 "주간 점검 질문" (매주 15분)

- Q1. 이번 주 목표 3개 중 몇 개가 완료되었나요?
- Q2. 가장 큰 리스크 1개는 무엇이고, 누가 언제 해결하나요?
- Q3. 다음 주에 사용자에게 보이는 변경사항은 무엇인가요?
- Q4. 실패 시 롤백 방법이 준비되었나요?

## 6) 수용 기준 (Definition of Done)

- 기능 기준:
  - Google/Kakao/Email 로그인 성공
  - 로그아웃 성공
  - refresh 토큰으로 세션 연장 성공
- 품질 기준:
  - 계정 전환 시 데이터 섞임 없음
  - 사용자에게 오류 안내 문구가 명확함
  - 운영 로그에서 request_id 기준 추적 가능

## 7) 리스크와 대응 (쉽게 설명)

- 리스크 1: 공급자 설정 오류 (OAuth redirect mismatch)
  - 대응: 스테이징에서 먼저 검증, 체크리스트 고정
- 리스크 2: 토큰 만료/갱신 오류
  - 대응: 만료/재로그인 케이스 자동/수동 테스트
- 리스크 3: 계정 전환 시 로컬 캐시 오염
  - 대응: 로그인 사용자 변경 시 사용자 캐시 namespace 분리

## 8) 이번 단계에서 하지 않는 것 (범위 보호)

- DB 대규모 스키마 변경 (Phase 2에서 진행)
- 분석 모델 품질 튜닝 (Phase 4에서 진행)
- 개인정보 삭제 큐 실운영 (Phase 5에서 진행)

---

문서 버전: v1.0  
연결 문서: [Master Plan](./master-plan.md), [API 계약 기준서](../contracts/api-contracts.md)  
최종 수정: 2026-02-19
