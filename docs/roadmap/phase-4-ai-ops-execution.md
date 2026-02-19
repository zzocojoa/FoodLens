# Phase 4 실행표: AI 분석 운영 안정화 (비개발자용)

이동: [Master Plan](./master-plan.md) | 이전: [Phase 3](./phase-3-sync-conflict-execution.md) | 다음: [Phase 5](./phase-5-privacy-security-deletion-execution.md)

## 1) 이 문서의 목적

- 라벨/음식/바코드 AI 분석을 "개발용 기능"에서 "운영 가능한 서비스"로 올리는 단계입니다.
- 장애, 느린 응답, 비용 급증 상황에서도 서비스가 버티도록 실무 기준을 정리합니다.

## 2) Phase 4 최종 목표 (다시 확인)

- 분석 API의 안정성, 속도, 비용을 운영 기준으로 관리
- 장애 시 사용자 영향 최소화 (fallback/재시도)
- 로그만으로 원인 추적 가능한 수준 확보

## 3) 역할 정의 (Who)

- PM/PO: SLA/SLO 목표 승인, 사용자 안내 정책 확정
- Backend Lead: timeout/retry/fallback/관측성 구현
- Mobile Lead: 에러 UX/재시도 UX/부분 결과 처리
- QA: 실패/지연/429 시나리오 검증
- DevOps: 모니터링/알림/비용 대시보드 운영

## 4) 주차별 실행표 (When / What)

### Week 1 (운영 기준선 확정)

- PM/PO
  - 목표값 승인:
    - 성공률
    - p95 지연시간
    - 월 비용 상한
- Backend Lead
  - 공통 정책 고정:
    - timeout
    - retry + backoff
    - 429 대응
    - fallback 응답 규칙
- Mobile Lead
  - 실패 UI 정책 확정 (재시도/안내 문구/부분 결과 표기)
- QA
  - 운영 실패 시나리오 테스트 설계
- 완료 체크
  - [ ] 운영 목표값 승인
  - [ ] 공통 실패 정책 문서화
  - [ ] 사용자 안내 정책 승인

### Week 2 (구현/계측)

- Backend Lead
  - 전 endpoint에 `request_id`, `used_model`, `prompt_version`, latency 단계 로그 적용
  - 429 전용 백오프/재시도 적용
  - **Model Optimization**: 프롬프트 최적화 및 경량 모델(Flash/Turbo) 우선 라우팅
  - 비용 가드레일(70/85/100) 정책 훅 적용 및 일일 쿼터 제한
- Mobile Lead
  - 실패 시 사용자 재시도 UX 적용
  - **On-device Caching**: 동일 바코드/이미지 해시 요청 시 로컬 캐시 우선 반환 (비용 절감)
  - fallback 응답 처리(치명 중단 방지)
  - 이미지 전송 최적화 (Resizing/Compression)로 Latency 감소
- DevOps
  - Render 로그/알림 세팅
  - 비용/에러율/지연 대시보드 설정
- 완료 체크
  - [ ] 샘플 요청에서 로그 추적 가능
  - [ ] 429 상황에서 정책대로 동작
  - [ ] 비용 가드레일 로그 확인

### Week 3 (운영 리허설/안정화)

- QA
  - 장애 리허설:
    - 타임아웃 유도
    - 429 유도
    - 모델 응답 불량 유도
  - 사용자 흐름 끊김 여부 점검
- Backend Lead + Mobile Lead
  - 상위 실패 패턴 보정
  - 메시지/코드 일관성 정리
- PM/PO
  - Go/No-Go 판단
- 완료 체크
  - [ ] 치명 중단 0건
  - [ ] 실패 시 복구 경로 명확
  - [ ] 운영 알림 정책 정상 동작

## 5) 비개발자용 "주간 점검 질문" (매주 15분)

- Q1. 이번 주 성공률/지연시간/비용은 목표 안에 들어왔나요?
- Q2. 오류가 나면 사용자는 무엇을 보게 되나요?
- Q3. 장애 원인을 로그로 바로 찾을 수 있나요?
- Q4. 비용 급증 시 자동 완화 정책이 동작하나요?

## 6) 수용 기준 (Definition of Done)

- 기능 기준:
  - `/analyze`, `/analyze/label`, `/lookup/barcode` 안정 동작
  - timeout/retry/429/fallback 정책 일관 적용
- 품질 기준:
  - request_id 기반 추적 가능
  - 운영 지표 대시보드 확인 가능
  - 장애 리허설 시 치명 중단 없음

## 7) 리스크와 대응 (쉽게 설명)

- 리스크 1: AI 공급자 429/쿼터 초과
  - 대응: 백오프 재시도 + fallback 정책 + 가드레일
- 리스크 2: 응답 지연으로 사용자 이탈
  - 대응: timeout + 사용자 재시도 UX + 단계별 지연 모니터링
- 리스크 3: 비용 급증
  - 대응: 70/85/100 임계치 정책 및 단계별 완화

## 8) 이번 단계에서 하지 않는 것 (범위 보호)

- 개인정보 삭제/TTL 자동화(Phase 5)
- 신규 인증 공급자 추가(Phase 1 범위)
- 대규모 DB 구조 재설계(Phase 2 범위)

---

문서 버전: v1.0  
연결 문서: [Master Plan](./master-plan.md), [Phase 3 실행표](./phase-3-sync-conflict-execution.md), [API 계약 기준서](../contracts/api-contracts.md)  
최종 수정: 2026-02-19
