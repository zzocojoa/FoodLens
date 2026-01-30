# 📱 iOS 앱 개발 프로젝트 명세서 (Developer Brief)

## 1. 프로젝트 개요 (Project Overview)

- **프로젝트 제목**: Food Lens (여행자용 AI 식재료 분석기)
- **프로젝트 설명**: 카메라로 음식을 찍으면 Vertex AI가 '숨겨진 재료'와 '알레르기 위험'을 분석해주는 여행 필수 유틸리티 앱.
- **타겟 플랫폼**: iOS (iPhone) / Swift, SwiftUI

## 2. 개발자 실무 요구사항 (Technical Requirements)

### A. 핵심 기능 (Core Features)

1.  **카메라 & 갤러리 연동**:
    - 앱 내에서 직접 사진 촬영 또는 앨범 사진 불러오기.
    - 이미지 압축 및 전처리 (API 전송 속도 최적화).
2.  **API 통신 (Networking)**:
    - **Endpoint**: Google Vertex AI (Gemini 2.0 Flash) API.
    - **Request**: 이미지(Binary) + 프롬프트(Text) 전송.
    - **Response**: JSON 포맷의 분석 결과 (음식명, 안전/위험 판정, 재료 리스트).
3.  **UI/UX (SwiftUI)**:
    - **메인**: 카메라 뷰파인더 스타일의 심플한 홈 화면.
    - **분석 대기**: 스켈레톤 UI 또는 로딩 인디케이터.
    - **결과 화면**:
      - 신호등(🔴/🟡/🟢) 직관적 안전도 표시.
      - 재료 갤러리 (BBox 좌표 기반 이미지 자르기/오버레이 구현).

### B. 기술 스택 (Tech Stack)

- **Language**: Swift 5+
- **Framework**: SwiftUI (UI), Combine or Async/Await (비동기 처리)
- **Backend/AI**: Google Vertex AI API (Direct execution via API Key or Firebase Functions proxy recommended to hide keys).

### C. 데이터 모델 (JSON Structure)

```json
{
  "project_title": "FoodLens_iOS",
  "features": [
    "Image_Capture",
    "Vertex_AI_Integration",
    "Ingredient_Parsing",
    "Allergy_Alert_UI"
  ]
}
```
