# FoodLens gstack/Codex 스킬 요청 플레이북

이 문서는 FoodLens 프로젝트에서 **현재 실제로 쓰는 스킬 요청 방식**을 정리한 운영 가이드입니다.

목표는 하나입니다.

- 언제 `전체 검토`로 넓게 요청해야 하는지
- 언제 `특정 기능/버그/화면`으로 좁혀서 요청해야 하는지
- FoodLens 기준으로 어떤 문장으로 요청하면 결과 품질이 좋은지

## 1. 가장 중요한 원칙

### 1.1 `전체` 요청도 가능하지만, 반드시 `검토 축`을 함께 적는다

좋지 않은 요청:

- `FoodLens 전체를 검토해줘`

좋은 요청:

- `gstack-plan-eng-review로 FoodLens 전체 구조를 검토해줘. auth, sync, analysis jobs, media, deletion, release gate를 포함해서 아키텍처, 데이터 흐름, 예외 상황, 테스트 갭을 정리해줘.`

핵심은 `전체` 자체가 문제가 아니라, **무엇을 기준으로 전체를 볼지**가 빠지면 결과가 흐려진다는 점입니다.

### 1.2 처음에는 넓게, 실행 단계에서는 좁게 간다

FoodLens처럼 모바일, 백엔드, sync, media, release가 모두 얽힌 프로젝트는 보통 아래 순서가 가장 효율적입니다.

1. 전체 진단
2. 도메인별 진단
3. 기능/화면/버그 단위 실행

예:

1. `gstack-plan-eng-review`로 전체 구조 검토
2. `gstack-investigate`로 `analysis_jobs`만 원인 분석
3. `gstack-review`로 현재 수정 diff 리뷰
4. `gstack-qa`로 수정 후 흐름 검증

### 1.3 `무엇을 원하나`에 따라 스킬을 고른다

- 방향/제품성 검토: `gstack-office-hours`, `gstack-plan-ceo-review`
- 구조/데이터 흐름/테스트 설계: `gstack-plan-eng-review`
- 버그 root cause 분석: `gstack-investigate`
- 현재 diff/PR 코드 검토: `gstack-review`
- QA 실행 및 수정: `gstack-qa`
- QA 리포트만: `gstack-qa-only`
- 구현된 화면 시각 QA: `gstack-design-review`
- 디자인 계획 검토: `gstack-plan-design-review`
- 배포 후 live 감시: `gstack-canary`
- 문서 정렬: `gstack-document-release`
- 보안 종합 점검: `gstack-cso`

## 2. 요청 작성 공식

아래 4개를 넣으면 대부분의 요청 품질이 좋아집니다.

1. 스킬 이름
2. 대상 범위
3. 검토 축 또는 재현 증상
4. 원하는 산출물

예:

- `gstack-investigate로 FoodLens에서 이미지가 다른 기기에서 안 보이는 문제를 분석해줘. local filename leak, asset upload, signed render URL shaping을 중심으로 root cause, 재현 조건, 영향 범위, 수정 방향까지 정리해줘.`

## 3. FoodLens에서 자주 쓰는 요청 패턴

### 3.1 제품/전략

언제 쓰나:

- 제품 정의가 흐릴 때
- 어떤 사용자를 먼저 잡아야 할지 헷갈릴 때
- 기능이 너무 많아 보여 scope를 줄이거나 재정의해야 할 때

추천 템플릿:

- `gstack-office-hours로 FoodLens 제품 전체를 검토해줘. 포지셔닝, 핵심 사용자, wedge, 기능 우선순위, 수익화, GTM, 리스크, 핵심 지표까지 포함해서 정리해줘.`
- `gstack-plan-ceo-review로 FoodLens 전략 전체를 재정의해줘. 지금 유지할 핵심과 줄여야 할 범위를 나눠주고, 다음 90일 우선순위를 제안해줘.`
- `gstack-office-hours로 FoodLens의 외부 메시지 전체를 검토해줘. 앱 설명, README, 스토어 문구, 제품 소개가 한 목소리인지 봐줘.`

### 3.2 아키텍처/데이터 흐름

언제 쓰나:

- 여러 기능이 얽힌 구조를 한 번에 보고 싶을 때
- sync, auth, analysis, media, deletion 사이 경계를 정리하고 싶을 때
- 테스트 공백과 운영 리스크를 같이 보고 싶을 때

추천 템플릿:

- `gstack-plan-eng-review로 FoodLens 아키텍처 전체를 검토해줘. auth, sync, analysis jobs, media, deletion, release gate를 포함해서 시스템 구조, 데이터 흐름, 예외 상황, 테스트 갭, 우선순위 제안으로 정리해줘.`
- `gstack-plan-eng-review로 FoodLens 데이터 흐름 전체를 검토해줘. 로그인부터 profile/settings/history sync, analysis, media render, deletion cleanup까지 end-to-end로 시퀀스 다이어그램과 함께 정리해줘.`
- `gstack-review로 FoodLens 전체 구조적 리스크를 검토해줘. production 관점에서 가장 위험한 5개 지점을 근거와 함께 우선순위별로 정리해줘.`

### 3.3 버그/원인 분석

언제 쓰나:

- 실제 오류, 401/500/503, 이상 동작이 이미 발생했을 때
- 여러 경계를 건드리는 증상이라 어느 층이 문제인지 모를 때

추천 템플릿:

- `gstack-investigate로 FoodLens에서 로그인 후 히스토리가 비어 보이는 문제를 분석해줘. account switch, phase2 sync, local cache ownership을 중심으로 root cause, 재현 조건, 영향 범위, 수정 방향까지 정리해줘.`
- `gstack-investigate로 FoodLens에서 analysis job이 멈춘 것처럼 보이는 문제를 분석해줘. submit, queue, worker, poll contract, UI retry까지 end-to-end로 따라가며 root cause를 찾아줘.`
- `gstack-investigate로 FoodLens에서 이미지가 다른 기기에서 안 보이는 문제를 분석해줘. local filename leak, asset upload, signed render URL shaping, sync payload를 중심으로 봐줘.`

### 3.4 코드 리뷰

언제 쓰나:

- 현재 브랜치 diff 또는 PR이 있을 때
- merge 전에 regression, 데이터 경계, 누락 테스트를 보고 싶을 때

추천 템플릿:

- `gstack-review로 현재 브랜치 diff를 리뷰해줘. auth/session과 phase2 sync 경계에서 production regression, 데이터 누수, missing tests를 우선순위별로 정리해줘.`
- `gstack-review로 analysis_jobs와 smoke workflow 변경만 리뷰해줘. live deploy risk와 rollback 관점에서 blocker를 찾아줘.`
- `gstack-review로 icon/splash 및 release script 변경을 리뷰해줘. Android/iOS 실기기 빌드 일관성과 stale native resource 리스크를 중심으로 봐줘.`

### 3.5 QA/실행

언제 쓰나:

- 핵심 플로우를 직접 검증하고 싶을 때
- 버그를 리포트만 받을지, 수정까지 할지 정해야 할 때
- 배포 후 live 상태를 점검할 때

추천 템플릿:

- `gstack-qa로 FoodLens 핵심 플로우를 테스트해줘. 로그인, 분석, 결과, 히스토리, support, account-data까지 포함하고 critical/high 버그는 수정 후 재검증해줘.`
- `gstack-qa-only로 FoodLens release candidate를 점검해줘. Android 실기기 기준으로 blocker와 non-blocker를 나눠서 리포트해줘.`
- `gstack-canary로 FoodLens production 배포 후 1차 운영 상태를 확인해줘. 로그인, /me, media render, analyze 진입을 우선으로 봐줘.`

### 3.6 디자인/UI

언제 쓰나:

- 실제 구현된 화면이 어색하거나 일관성이 떨어질 때
- 여러 시안이 필요할 때
- 제품 포지셔닝과 시각 언어가 맞는지 보고 싶을 때

추천 템플릿:

- `gstack-design-review로 FoodLens 홈, 결과, 히스토리 화면을 검토해줘. 정보 위계, 가독성, 일관성, 모바일 실사용성 기준으로 문제를 찾고 개선까지 진행해줘.`
- `gstack-plan-design-review로 FoodLens 전체 UI 방향을 검토해줘. 지금 제품 포지셔닝에 맞는 디자인 언어인지, 화면별 우선순위와 개선 방향을 정리해줘.`
- `gstack-design-shotgun으로 FoodLens 결과 화면 대안을 여러 개 보여줘. 더 신뢰감 있고 덜 복잡한 방향을 비교하고 싶어.`

### 3.7 릴리스/운영

언제 쓰나:

- release gate, smoke, rollback, rollout, 운영 모니터링을 묶어 점검하고 싶을 때
- 현재 workflow/diff가 production risk를 막는지 보고 싶을 때

추천 템플릿:

- `gstack-plan-eng-review로 FoodLens 릴리스/운영 구조를 검토해줘. Android/iOS release flow, GitHub Actions, Render deploy, smoke, rollback rehearsal, rollout flag, 운영 모니터링을 포함해서 구조, 리스크, 예외 상황, 테스트/관측 공백을 정리해줘.`
- `gstack-review로 FoodLens release gate 관련 현재 변경을 리뷰해줘. workflow, smoke script, rollback evidence, required checks가 실제 production risk를 막는지 봐줘.`
- `gstack-canary로 FoodLens production 배포 후 1차 운영 상태를 확인해줘. 로그인, /me, media render, analyze 진입을 우선으로 봐줘.`

### 3.8 보안

언제 쓰나:

- auth, media, sync, deletion, release workflow까지 포함한 넓은 공격면을 보고 싶을 때
- 위협 모델, 시크릿 관리, 공급망, LLM trust boundary를 같이 보고 싶을 때

추천 템플릿:

- `gstack-cso로 FoodLens 전체 보안 점검을 해줘. auth, token/session, sync, media access, deletion, release workflows, secrets handling, dependency supply chain, LLM trust boundary를 포함해서 production risk를 우선순위별로 정리해줘.`
- `security-threat-model로 FoodLens 전체 신뢰 경계를 모델링해줘. 모바일 앱, 백엔드, DB, 미디어, Render, GitHub Actions를 포함해서 자산, 공격자, abuse path, 방어 포인트를 정리해줘.`
- `security-best-practices로 FoodLens 현재 auth/media/deletion 변경을 검토해줘. secure-by-default가 깨지는 부분과 누락된 검증을 찾아줘.`

## 4. 전체 요청 vs 부분 요청 판단표

### 4.1 전체 요청이 맞는 경우

- 지금 뭐가 제일 위험한지부터 알고 싶다
- 구조, 방향, 운영 공백을 한 번에 보고 싶다
- 프론트/백엔드/운영이 얽혀 있어서 어디서 잘라야 할지 모른다

예:

- `gstack-plan-eng-review로 FoodLens 전체 구조를 검토해줘`
- `gstack-office-hours로 FoodLens 제품 전체를 검토해줘`
- `gstack-cso로 FoodLens 전체 보안 점검을 해줘`

### 4.2 부분 요청이 맞는 경우

- 증상이 이미 특정 기능에서 재현된다
- 수정 대상이 한 기능, 한 화면, 한 도메인으로 좁혀졌다
- merge 전에 현재 diff만 보고 싶다

예:

- `gstack-investigate로 email login 계정이 사라지는 원인을 분석해줘`
- `gstack-review로 현재 브랜치의 analysis_jobs 변경만 리뷰해줘`
- `gstack-design-review로 결과 화면만 개선해줘`

## 5. FoodLens에서 추천하는 기본 흐름

### 5.1 구조/전략이 먼저 필요한 경우

1. `gstack-office-hours` 또는 `gstack-plan-ceo-review`
2. `gstack-plan-eng-review`
3. `gstack-review`
4. `gstack-qa`

### 5.2 버그가 먼저 발생한 경우

1. `gstack-investigate`
2. `gstack-review`
3. `gstack-qa`

### 5.3 출시 직전인 경우

1. `gstack-review`
2. `gstack-qa` 또는 `gstack-qa-only`
3. `gstack-canary`
4. 필요 시 `gstack-land-and-deploy`

## 6. 바로 복사해서 쓸 수 있는 대표 요청 10개

1. `gstack-office-hours로 FoodLens 제품 전체를 검토해줘. 포지셔닝, 핵심 사용자, wedge, 수익화, GTM, 리스크를 정리해줘.`
2. `gstack-plan-eng-review로 FoodLens 전체 구조를 검토해줘. auth, sync, analysis jobs, media, deletion, release gate를 포함해서 아키텍처, 데이터 흐름, 예외 상황, 테스트 갭을 정리해줘.`
3. `gstack-investigate로 FoodLens에서 로그인 후 히스토리가 비어 보이는 문제를 분석해줘.`
4. `gstack-investigate로 FoodLens에서 analysis job이 멈춘 것처럼 보이는 문제를 분석해줘.`
5. `gstack-review로 현재 브랜치 diff를 리뷰해줘. production regression과 missing tests를 우선순위별로 정리해줘.`
6. `gstack-qa로 FoodLens 핵심 플로우를 테스트해줘. 로그인, 분석, 결과, 히스토리, support까지 포함해줘.`
7. `gstack-design-review로 FoodLens 홈, 결과, 히스토리 화면을 검토해줘.`
8. `gstack-plan-eng-review로 FoodLens 릴리스/운영 구조를 검토해줘. smoke, rollback, rollout, Render deploy까지 포함해줘.`
9. `gstack-cso로 FoodLens 전체 보안 점검을 해줘. auth, sync, media, deletion, release workflows, secrets handling을 포함해줘.`
10. `gstack-document-release로 FoodLens 전체 문서를 현재 shipped 상태에 맞춰 정리해줘.`

## 7. 주의 사항

- `gstack-review`는 가능하면 **현재 브랜치 diff/PR**를 대상으로 쓰는 것이 가장 효율적입니다.
- `gstack-investigate`는 **증상과 재현 조건**을 함께 적을수록 root cause 탐색 품질이 올라갑니다.
- `gstack-qa`는 테스트 범위와 수정 여부를 함께 적는 것이 좋습니다.
- `gstack-plan-eng-review`는 가능한 한 `포함할 도메인`을 나열하는 편이 좋습니다.
- `gstack-cso`는 보안 전용 요청일 때 쓰는 것이 좋고, 일반 코드 품질 검토는 `gstack-review`가 더 맞습니다.

## 8. 한 줄 요약

FoodLens에서는 보통 아래 한 줄이면 충분합니다.

- 방향이 궁금하면: `gstack-office-hours` 또는 `gstack-plan-ceo-review`
- 구조가 궁금하면: `gstack-plan-eng-review`
- 버그 원인이 궁금하면: `gstack-investigate`
- 현재 변경 검토는: `gstack-review`
- 실제 테스트는: `gstack-qa`
- 배포 후 확인은: `gstack-canary`
- 보안은: `gstack-cso`
