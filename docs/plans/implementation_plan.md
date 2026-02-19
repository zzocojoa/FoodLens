# Food Lens 구현 계획 (Implementation Plan)

작성일: 2026-02-13

## 1) 목표
여행 중 낯선 음식/식재료를 카메라로 분석해 **안전성(OK/AVOID/ASK), 성분, 알레르기 위험**을 빠르게 제공하는 모바일 앱을 안정적으로 운영한다.

핵심 성공 기준:
- 분석 요청-결과 표시 흐름 안정화
- 결과 신뢰도 및 사용자 이해도 향상
- 기록/히스토리/여행 통계 기반 재방문율 개선

## 2) 현재 기준 아키텍처
- 앱: React Native + Expo Router + TypeScript (`FoodLens/`)
- 주요 기능: Scan Camera, Result, History List/Map, Profile, Trip Stats, Home Dashboard
- 서버: Python 백엔드(`backend/`) + 바코드 조회/분석 모듈
- 저장/상태: `dataStore`, `analysisService`, `userService`, 로컬 캐시

## 3) 우선순위 로드맵

### Phase A. 안정화 (P0)
목표: 사용자 핵심 플로우 오류/지연 최소화
- 스캔 → 결과 진입 시간 단축 (바코드 캐시 우선 경로 유지)
- 오프라인/서버 오류 처리 일관화 (알림 문구/재시도 정책 통일)
- 결과 화면 초기 렌더 안정화 (이미지 로딩 fallback/에러 처리)
- 필수 회귀 테스트 시나리오 고정

완료 기준:
- 주요 플로우에서 치명적 크래시 0
- 스캔/결과/히스토리 이동 경로 회귀 이슈 없음

### Phase B. 구조 개선 (P1)
목표: 유지보수성과 테스트 가능성 강화
- 조립형 화면 + 로직 훅 + 서비스 분리 원칙 적용
- 사이드이펙트(네트워크/타이머/네비게이션) service/hook으로 격리
- 순수 계산 로직 utils로 이동 및 테스트 우선
- 순환 import 방지 규칙 적용

완료 기준:
- 핵심 feature 훅의 책임 분리 완료
- `tsc --noEmit`, `npm run lint` 에러 0 유지
- 새로 분리된 순수 함수 테스트 추가

### Phase C. 제품 고도화 (P2)
목표: 사용자 가치 확장
- 사용자 알레르기 기반 경고 문구 정밀화
- 히스토리 인사이트(기간/지역/위험 패턴) 강화
- 다국어 표시 품질 개선
- 성능 모니터링/분석 로그 체계 고도화

완료 기준:
- 사용자 피드백 기반 개선 항목 반영
- 화면/데이터 지표(재방문, 분석 완료율) 개선 추세 확인

## 4) 개발 원칙
- 기능 변경 없는 리팩토링 우선 (behavior-preserving)
- 컴포넌트는 렌더/조립 중심으로 얇게 유지
- 네트워크/스토리지/권한 로직은 서비스 계층에 배치
- 타입은 `types`로 공유, 하드코딩 문자열 최소화
- 문서와 코드 동기화(리팩토링/구조 변경 시 docs 갱신)

## 5) 품질 게이트
- 자동 게이트: `cd FoodLens && npm run i18n:release-gate`
  - 포함 검사: `i18n:verify` + `tsc` + `lint`
- 수동 회귀 체크:
  - 홈 → 스캔 → 결과
  - 홈 → 히스토리(리스트/맵)
  - 프로필 저장/알레르기 반영
  - 여행 시작/토스트/통계 반영
- 다국어 회귀 기준: `docs/plans/i18n-regression-scenarios.md`
- 배포 전 체크: 네트워크 불안정/오프라인 대응 검증

## 6) 최근 완료 사항 (요약)
- HistoryList 모듈화
- ScanCamera/CameraGateway 모듈화
- HistoryMap 상태 훅 분리(파생데이터/이펙트)
- HomeScreen 컨트롤러/네비게이션 서비스 분리
- Profile/TripStats 훅 책임 분리
- 관련 리팩토링 커밋 반영 및 원격 푸시 완료

## 7) 다음 실행 항목
1. `features/result/screens/ResultScreen.tsx` 구조 분리 (화면 조립 vs 상태/사이드이펙트)
2. `features/history/screens/HistoryScreen.tsx` 구조 분리
3. 리팩토링된 순수 함수 단위 테스트 보강
4. 문서(`docs/`)를 루트 기준으로 지속 관리
