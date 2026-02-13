# Food Lens: 메뉴판 & 성분 분석기 구현 계획

## 목표

해외 여행객을 위해 음식 사진과 메뉴판을 분석하여 **성분, 알레르기 정보, 식문화 배경**을 제공하는 앱(MVP)을 개발합니다.

## 핵심 가치 (Value Proposition)

1.  **똑똑한 여행 가이드**: 단순 번역을 넘어 "먹어도 되는 음식"인지 판단.
2.  **멀티모달 분석**: 텍스트(메뉴판) + 시각 정보(음식 사진) + 배경 지식(레시피 데이터) 결합.
3.  **정교한 UX**: 사용자 클릭에 반응하는 재료 분석 (SAM 2 활용).

## 기술 스택 (Tech Stack)

- **Frontend**: Streamlit (빠른 프로토타이핑) 또는 React (추후 확장).
- **AI Core**:
  - **Reasoning/OCR**: Google Vertex AI (Gemini 2.0 Flash) - 메뉴판 번역, 숨겨진 재료 추론.
  - **Segmentation**: Meta SAM 2 (Segment Anything Model 2) - 음식 재료 시각적 분리.
- **Backend**: Python (FastAPI/Flask) - 로컬 데모는 단일 스크립트로 구현 가능.

## 구현 기능 (Phase 1: MVP)

### 1. 메뉴판 & 음식 복합 분석

- **Input**: 메뉴판 사진 + 음식 사진.
- **Process**:
  - Gemini가 메뉴판 텍스트(현지어) 추출 및 번역.
  - 음식 사진과 매칭하여 "표준 레시피" 기반 성분 추론.
  - 사용자 알레르기 프로필(예: 땅콩, 갑각류)과 대조.
- **Output**: "위험/주의/안전" 신호등 표시 및 설명.

### 2. 터치로 재료 확인 (Magic Touch)

- **Input**: 사용자가 음식 사진의 특정 부위 터치.
- **Process**:
  - SAM 2가 터치 지점의 객체(예: 고수) 마스크 추출.
  - Cropped 이미지를 Gemini에게 전송 ("이 재료가 뭐야?").
- **Output**: 재료 이름 및 설명 ("이것은 고수입니다. 향이 강할 수 있습니다.").

### 3. 소통 카드 (Communication Card)

- **Input**: 분석 결과가 '주의/불확실'일 때.
- **Output**: 현지어 질문 카드 생성 ("이 음식에 새우 젖갈이 들어갔나요?").

## 파일 구조 (예상)

- `main.py`: 통합 실행 스크립트.
- `setup.sh`: 필요 라이브러리 설치 (SAM 2, Vertex AI SDK 등).
- `backend/modules/analyst.py`: Gemini 분석 모듈.
- `backend/modules/segmenter.py`: SAM 2 분할 모듈.

## 실행 계획

1.  **환경 설정**: `google-genai`, `sam2`, `streamlit` 설치.
2.  **모듈 개발**: Gemini 분석기 -> SAM 2 분할기 순서로 구현.
3.  **통합 테스트**: 샘플 이미지로 전체 파이프라인 검증.
