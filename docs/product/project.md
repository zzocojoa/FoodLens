## FoodLens 제품 정의서 (PRD)

### 1. 제품 한 문장 정의

FoodLens는 **해외 여행 중 낯선 음식 사진이나 식품 라벨을 바탕으로, 사용자 알레르기 기준으로 먹어도 되는지 빠르게 판단하도록 돕는 모바일 앱**입니다.

### 2. 해결하려는 문제

- 여행 중 메뉴판, 포장식품 라벨, 진열대 상품을 봐도 성분과 위험도를 빠르게 판단하기 어렵습니다.
- 식당, 배달, 길거리 음식처럼 바코드가 없는 상황에서는 음식 사진만으로도 빠른 판단이 필요합니다.
- 언어 장벽 때문에 알레르기 유발 성분을 놓치기 쉽습니다.
- 일반 검색은 느리고, 현장 의사결정 순간에 바로 쓸 수 있는 형태가 아닙니다.

FoodLens의 핵심은 "음식을 잘 설명하는 앱"이 아니라, **먹기 전 안전 판단을 돕는 도구**가 되는 것입니다.

### 3. 타겟 사용자

#### 3.1 1차 타겟

- 해외 여행 중 알레르기 또는 식이 제한이 있는 사용자
- 언어 장벽 때문에 식품 라벨 해석이 어려운 사용자
- 빠른 현장 판단이 중요한 사용자

#### 3.2 2차 타겟

- 새로운 음식을 시도하지만 성분 확인이 필요한 일반 여행자
- 가족 구성원의 알레르기 정보를 함께 관리해야 하는 사용자

### 4. 핵심 사용자 시나리오

1. **음식 사진 기반 안전 판단**
   - 사용자가 실제 음식 사진을 찍으면 어떤 음식인지 추정하고, 잠재 알레르기 위험을 빠르게 파악합니다.
2. **포장식품 라벨 분석**
   - 사용자가 라벨 사진을 찍으면 성분, 영양, 위험도를 즉시 확인합니다.
3. **바코드 기반 빠른 경로**
   - 바코드가 지원되면 제품 정보를 빠르게 확인하고, 미지원 시 즉시 라벨 사진 분석으로 전환합니다.
4. **여행자 카드/프로필 활용**
   - 미리 저장한 알레르기 정보와 여행자 카드 언어 설정을 결과와 연결합니다.
5. **사후 검토 및 문의**
   - 결과를 저장하고, 히스토리에서 다시 열어보거나 문의 메일로 오분석을 신고합니다.

### 5. 현재 제품 범위 (2026-04 기준)

#### 5.1 앱에서 제공하는 핵심 범위

- Google / Kakao / Email 로그인
- 이메일 인증, 비밀번호 재설정, refresh/logout
- 프로필, 알레르기, 설정, 여행자 카드 언어 관리
- 음식 사진 / 라벨 / 바코드 분석
- 비동기 분석 작업 큐(`/analyze/jobs`)
- 히스토리 저장, 삭제, 재열람, 푸드 패스포트/지도
- 미디어 업로드 및 signed render URL 기반 이미지 표시
- Support & Policies 허브
- Delete My Data / Delete Account

#### 5.2 현재 운영 범위

- FastAPI 백엔드가 Render에서 동작
- 분석/인증/삭제/retention 관련 주요 상태는 Postgres에 저장
- 미디어는 GCS에 업로드 후 signed `/media/render/{asset_id}`로 제공
- GitHub Actions 기반 release gate, post-deploy smoke, rollback rehearsal 운영

### 6. 제품 비목표 (지금 하지 않는 것)

- 의료 진단 또는 전문 영양 상담 대체
- 음식 SNS/리뷰 커뮤니티
- 범용 여행 추천 앱
- 대규모 소셜 피드, 랭킹, 게임화 중심 제품

### 7. 차별화 포인트

- 단순 음식 인식이 아니라 **사용자 알레르기 프로필과 연결된 보수적 안전 판단**을 제공합니다.
- 음식 사진, 라벨, 바코드 입력을 하나의 결과 UX로 묶고, 바코드 실패 시 라벨 분석으로 자연스럽게 전환합니다.
- 여행자 카드, 히스토리, 푸드 패스포트, 지원/정책 허브까지 하나의 흐름으로 제공합니다.
- 출시 게이트, post-deploy smoke, rollback rehearsal까지 포함한 운영 신뢰성을 갖춥니다.

### 8. 기술 Truth 요약

- Mobile: Expo Router + React Native + TypeScript
- Backend: FastAPI
- 분석: Gemini + 바코드 조회 + 서버-side job queue
- 인증/세션: 백엔드 `/auth/*` + 모바일 secure storage
- 데이터 저장: Postgres 기반 auth/settings/history/deletion/retention stores
- 미디어: GCS 업로드 + signed render URL
- 배포: Render + EAS Build/Submit + GitHub Actions

상세 내용은 다음 문서를 기준으로 봅니다.

- 아키텍처: [`/docs/architecture-overview.md`](../architecture-overview.md)
- API 계약: [`/docs/contracts/api-contracts.md`](../contracts/api-contracts.md)
- 출시 운영: [`/docs/roadmap/phase-6-release-gate-execution.md`](../roadmap/phase-6-release-gate-execution.md)

### 9. 핵심 지표

- 설치 -> 첫 분석 완료 전환율
- 첫 분석 -> 히스토리 저장 전환율
- 7일 재방문율
- 분석 성공률 / p95 지연시간
- 오분석 신고율
- 알레르기 프로필 설정 완료율

### 10. 현재 출시 상태

- Android release gate: **Go 승인 완료**
- Android: Play Console 내부 테스트 수동 업로드 단계
- iOS: 앱 자산/스플래시 수정 반영 완료, 스토어 배포는 Apple 배포 등록 이후 진행

### 11. 문서 운영 원칙

- 현재 제품 판단은 이 PRD, API 계약, 아키텍처 요약, 법률 문서를 기준으로 합니다.
- 과거 `SwiftUI / Firestore / Firebase Cloud Functions` 기반 계획은 현재 구현 truth가 아닙니다.
