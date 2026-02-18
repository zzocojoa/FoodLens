# 사용자 데이터베이스 및 AI 피드백 루프 파이프라인 설계서

## 1. 개요 (Overview)

현재 FoodLens는 로컬 스토리지(`AsyncStorage`) 기반으로 동작하는 '오프라인 퍼스트(Offline-First)' 구조입니다.
사용자 요청에 따라 **(1) 사용자별 정밀 식재료 매핑**과 **(2) AI 분석 결과 피드백 루프(Good/Bad)**를 구축하기 위해, **Firebase Firestore**를 도입한 하이브리드 아키텍처를 제안합니다.

---

## 2. 아키텍처 변경안 (Architecture)

### AS-IS (현재)

- **User Info**: 로컬 스토리지에 단순 저장 (이름, 알러지 텍스트).
- **History**: 로컬 JSON 파일로 저장 (`AnalysisRecord`).
- **Feedback**: 없음.

### TO-BE (제안)

- **Hybrid Sync**: 기본 기능은 로컬에서 빠르게 동작하되, 백그라운드에서 클라우드(Firebase)와 동기화.
- **User DB**: 사용자별 정밀 알러지/선호 식재료 데이터를 클라우드에 저장.
- **Feedback Loop**: 사용자가 분석 결과에 대해 '좋아요/싫어요'를 누르면, 해당 데이터(이미지+분석결과+사용자수정)를 별도 컬렉션에 저장하여 AI 모델 재학습(Fine-tuning) 데이터셋으로 활용.

---

## 3. 데이터베이스 스키마 설계 (Firestore Schema)

### 3.1. 사용자 프로필 (`users` Collection)

사용자의 기본 정보와 정밀한 식재료 회피 설정을 저장합니다.

```json
// users/{userId}
{
  "uid": "user_12345",
  "email": "user@example.com",
  "nickname": "Foodie",
  "preferences": {
    "primaryAllergens": ["Peanut", "Shellfish"], // 주요 알러지 (UI 선택)
    "customAvoidance": ["Cilantro", "Cucumber"], // "고수 빼주세요", "오이 싫어요" 등 정밀 매핑
    "spiceTolerance": "LEVEL_1" // 매운맛 허용도 (선택)
  },
  "settings": {
    "language": "ko",
    "autoPlayAudio": true
  },
  "createdAt": "2024-02-18T10:00:00Z",
  "lastLoginAt": "2024-02-18T12:00:00Z"
}
```

### 3.2. 식재료 매핑 테이블 (`ingredients_map` Collection) - Read Only

다국어 식재료명을 표준화하여 매핑하는 마스터 데이터입니다.
AI가 'Tamago'라고 인식하든 'Egg'라고 인식하든, 내부적으로는 `ING_EGG_001` ID로 처리하여 정확도를 높입니다.

```json
// ingredients_map/{ingredientId}
{
  "id": "ING_EGG_001",
  "names": {
    "en": ["Egg", "Eggs"],
    "ko": ["계란", "달걀"],
    "ja": ["卵", "玉子"]
  },
  "category": "ANIMAL_PRODUCT",
  "defaultAllergenType": "EGG"
}
```

### 3.3. AI 피드백 루프 (`analysis_feedback` Collection)

사용자가 남긴 피드백을 저장하여 모델 성능 개선에 활용합니다.

```json
// analysis_feedback/{feedbackId}
{
  "feedbackId": "fb_987654",
  "userId": "user_12345",
  "analysisId": "local_record_id_123", // 로컬 기록 연결용
  "timestamp": "2024-02-18T12:30:00Z",

  // 1. 원본 AI 분석 결과 (Snapshot)
  "originalResult": {
    "foodName": "Spicy Ramen",
    "detectedIngredients": ["Noodle", "Pork", "Green Onion"],
    "modelParams": {
      "model": "gemini-2.0-flash",
      "temperature": 0.2
    }
  },

  // 2. 사용자 피드백 (핵심)
  "userFeedback": {
    "rating": "BAD", // "GOOD" | "BAD"
    "correctionType": "WRONG_FOOD_NAME", // "MISSING_INGREDIENT", "WRONG_ALLERGY_ALERT"
    "correctedFoodName": "Jjamppong", // 사용자가 수정한 음식 이름
    "comment": "이거 라멘 아니고 짬뽕이에요. 해물 들어있음.",
    "missingIngredients": ["Squid", "Mussel"] // 사용자가 추가한 재료
  },

  // 3. 이미지 참조 (선택)
  "imageStoragePath": "feedback_images/fb_987654.jpg"
}
```

---

## 4. 구현 로드맵 (Roadmap)

### Phase 1: 기반 구축 (Firebase 연동)

1.  Firebase 프로젝트 생성 및 `google-services.json` 설정.
2.  `@react-native-firebase/app`, `auth`, `firestore` 라이브러리 설치.
3.  익명 로그인(Anonymous Auth) 구현하여 사용자 ID 생성.

### Phase 2: 사용자 DB 연동

1.  앱 시작 시 `users/{uid}` 문서를 읽어와 로컬 설정(`AsyncStorage`)과 동기화.
2.  설정 화면에서 '싫어하는 재료' 추가 기능 구현 -> Firestore `customAvoidance` 필드 업데이트.

### Phase 3: 피드백 UI 및 루프 구현

1.  분석 결과 화면(`ResultScreen`) 하단에 "결과가 정확한가요?" 👍/👎 버튼 추가.
2.  👎 버튼 클릭 시, 간단한 수정 모달(음식 이름 수정, 코멘트) 팝업.
3.  전송 시 `analysis_feedback` 컬렉션에 데이터 저장.

### Phase 4: 데이터 활용 (AI 개선)

1.  주기적으로 `analysis_feedback` 데이터를 분석.
2.  자주 틀리는 음식(예: 짬뽕 vs 라멘)을 식별하여 프롬프트 개선(`prompts.py`).
3.  장기적으로는 이 데이터를 모아 전용 AI 모델 파인튜닝(Fine-tuning)에 사용.
