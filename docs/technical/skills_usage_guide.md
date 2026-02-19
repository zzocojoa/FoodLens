# Codex Skills 사용 가이드

이 문서는 FoodLens 프로젝트에서 현재 사용 가능한 Codex 스킬의 이름, 설명, 사용 방법을 정리한 문서입니다.

## 1. 공통 사용 방법

### 1.1 스킬 호출 방식

- 채팅에서 스킬명을 직접 적어 호출합니다.
- 형식: `$<skill-name>`

예시:

- `$render-deploy`
- `$security-threat-model`
- `$doc`

### 1.2 요청 작성 방식

- 스킬명 + 원하는 작업을 한 문장으로 명확히 작성합니다.
- 여러 스킬이 필요하면 순서를 함께 적습니다.

예시:

- `$security-best-practices Python/TypeScript 서버 보안 점검해줘`
- `$security-threat-model 먼저 위협 모델 작성하고, $doc 으로 문서화해줘`

## 2. 스킬 목록

### 2.1 문서/배포/도구

1. `doc`
- 설명: `.docx` 문서 읽기/생성/편집이 필요할 때 사용합니다. 서식/레이아웃 정확도가 중요할 때 적합합니다.
- 사용 방법: `$doc` + 문서 작업 요청
- 예시: `$doc 이 요구사항을 보고서 형식의 .docx로 만들어줘`

2. `render-deploy`
- 설명: Render 배포를 위해 코드베이스 분석, `render.yaml` 생성, 배포 설정 가이드를 제공합니다.
- 사용 방법: `$render-deploy` + 배포 대상/환경 요청
- 예시: `$render-deploy 이 프로젝트를 Render에 배포 가능한 설정으로 만들어줘`

3. `screenshot`
- 설명: 데스크톱 전체, 특정 앱/창, 화면 일부의 OS 레벨 스크린샷이 필요할 때 사용합니다.
- 사용 방법: `$screenshot` + 캡처 범위/대상 지정
- 예시: `$screenshot 현재 활성 창만 캡처해줘`

### 2.2 보안 분석

4. `security-best-practices`
- 설명: Python/JavaScript/TypeScript/Go 코드에 대해 보안 모범 사례 관점 점검과 개선안을 제시합니다.
- 사용 방법: `$security-best-practices` + 대상 경로/언어/점검 범위 지정
- 예시: `$security-best-practices server.py와 backend/modules 폴더 보안 점검해줘`

5. `security-ownership-map`
- 설명: Git 히스토리를 기반으로 보안 관점의 코드 소유 구조, 버스 팩터, 민감 코드 소유 리스크를 분석합니다.
- 사용 방법: `$security-ownership-map` + 분석 범위/출력 목적 지정
- 예시: `$security-ownership-map 민감 코드 소유 공백과 버스 팩터 리스크 분석해줘`

6. `security-threat-model`
- 설명: 저장소 기반 위협 모델링(자산, 신뢰 경계, 공격 경로, 완화책)을 수행하고 Markdown 결과를 생성합니다.
- 사용 방법: `$security-threat-model` + 시스템 경계/대상 모듈 지정
- 예시: `$security-threat-model FoodLens 백엔드 API 중심으로 위협 모델 작성해줘`

### 2.3 스킬 관리

7. `skill-creator`
- 설명: 새 스킬 생성 또는 기존 스킬 개선이 필요할 때 사용합니다.
- 사용 방법: `$skill-creator` + 만들 스킬 목적/입력/출력 정의
- 예시: `$skill-creator FoodLens QA 자동화 스킬을 만들고 싶어`

8. `skill-installer`
- 설명: 큐레이션 목록 또는 GitHub 경로에서 스킬을 설치합니다.
- 사용 방법: `$skill-installer` + 목록 조회 또는 설치 대상 지정
- 예시: `$skill-installer`
- 예시: `$skill-installer openai/skills의 특정 스킬 설치해줘`

## 3. 운영 팁

- 스킬은 현재 턴에서 명시해야 적용됩니다. 다음 턴에 자동 유지되지 않습니다.
- 요청이 스킬 목적과 정확히 맞을수록 결과 품질이 좋아집니다.
- 보안 스킬(`security-*`)은 일반 코드리뷰가 아니라 보안 분석 요청일 때 사용하는 것이 적합합니다.
