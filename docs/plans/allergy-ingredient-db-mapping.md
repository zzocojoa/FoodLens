# 사용자 알러지 DB와 식재료 매핑 테이블 구축 예시 (Design Example)

이 문서는 AI 분석 정확도 향상과 사용자 맞춤형 알림 제공을 위한 **"사용자 알러지 DB"**와 **"표준 식재료 매핑 테이블"**의 데이터 설계 예시입니다. (실제 코드 구현 전 참조용)

---

## 1. 📋 식재료 마스터 DB (Ingredient Master Table)

AI가 인식한 다양한 텍스트(예: "Egg", "Tamago", "Fried Egg")를 하나의 **표준 코드(`ING_ID`)**로 통합하여 관리합니다. 이를 통해 언어에 상관없이 정확한 알러지 매칭이 가능해집니다.

**Collection Name Example:** `ingredients_master`

| 필드명 (Field)        | 타입 (Type) | 설명 (Description)             | 예시 데이터 (Example)                                          |
| :-------------------- | :---------- | :----------------------------- | :------------------------------------------------------------- |
| **`id`** (PK)         | String      | 식재료 고유 식별 코드          | `"ING_EGG_001"`                                                |
| **`name_key`**        | String      | 다국어 처리용 키               | `"ingredient_egg_whole"`                                       |
| **`category`**        | Enum        | 대분류 (알러지 그룹핑용)       | `"ANIMAL_PRODUCT"`                                             |
| **`allergen_type`**   | Enum        | 알러지 유발 종류 (없으면 null) | `"EGG"`                                                        |
| **`risk_level`**      | Int         | 알러지 위험 등급 (1~5)         | `4` (매우 흔함)                                                |
| **`search_keywords`** | Array       | AI 인식용 키워드 동의어        | `["egg", "omelet", "yolk", "white", "tamago", "계란", "달걀"]` |

### 💡 데이터 예시 (JSON)

```json
{
  "id": "ING_SHRIMP_001",
  "category": "SEAFOOD",
  "allergen_type": "SHELLFISH",
  "names": {
    "en": "Shrimp",
    "ko": "새우",
    "ja": "海老 (Ebi)",
    "th": "กุ้ง (Kung)"
  },
  "search_keywords": [
    "shrimp",
    "prawn",
    "gambas",
    "ebi",
    "cocktail shrimp",
    "새우",
    "대하",
    "칵테일새우"
  ],
  "cross_contamination_group": "CRUSTACEAN" // 갑각류 그룹 (게, 랍스터와 교차 오염 가능성)
}
```

---

## 2. 👤 사용자 알러지 프로필 DB (User Allergy Profile DB)

사용자별로 단순히 "갑각류 알러지"뿐만 아니라, **"익힌 새우는 괜찮지만 생새우는 안됨"** 같은 정밀한 설정까지 저장할 수 있도록 설계합니다.

**Collection Name Example:** `user_preferences`

| 필드명 (Field)          | 타입 (Type) | 설명 (Description)     | 예시 데이터 (Example)                       |
| :---------------------- | :---------- | :--------------------- | :------------------------------------------ |
| **`uid`** (PK)          | String      | 사용자 고유 ID         | `"user_12345"`                              |
| **`primary_allergens`** | Array       | 주요 알러지 (대분류)   | `["PEANUT", "SHELLFISH"]`                   |
| **`custom_avoidance`**  | Array       | 개인 기호 하위 재료 ID | `["ING_CILANTRO_001", "ING_CUCUMBER_001"]`  |
| **`severity_levels`**   | Map         | 알러지별 민감도 설정   | `{"PEANUT": "ANAPHYLAXIS", "MILK": "MILD"}` |

### 💡 데이터 예시 (JSON)

```json
{
  "uid": "user_beatlefeed",
  "nickname": "ProTraveler",
  "allergy_profile": {
    // 1. 대분류 알러지 (Major Groups)
    "primary_allergens": ["SHELLFISH", "PEANUT"],

    // 2. 민감도 상세 설정 (Severity)
    "severity": {
      "SHELLFISH": "SEVERE", // 닿기만 해도 위험
      "PEANUT": "MILD" // 소량은 괜찮음
    },

    // 3. 예외 조건 (Advanced) - '익힌건 괜찮음' 등
    "exceptions": [
      {
        "target_ingredient": "ING_SHRIMP_001",
        "condition": "COOKED_ONLY", // 익힌 상태는 허용
        "note": "생새우 초밥만 피하면 됩니다."
      }
    ]
  },
  "disears_avoidance": [], // 당뇨, 고혈압 등 질병 관련 회피
  "religious_avoidance": ["PORK"] // 종교적 이유 (할랄 등)
}
```

---

## 3. 🔗 매핑 로직 (Mapping Logic Flow)

식재료 마스터 DB와 사용자 DB가 어떻게 연결되어 분석되는지 보여주는 흐름입니다.

### **Step 1: AI 분석 (Raw Data)**

AI가 이미지를 보고 텍스트를 출력합니다.

> **AI Output:** `"Fried Rice with Gambas"`

### **Step 2: 키워드 매칭 (Normalization)**

서버가 `ingredients_master`의 `search_keywords`를 검색하여 표준 ID로 변환합니다.

- `"Fried Rice"` -> `ING_RICE_001`
- `"Gambas"` -> `ING_SHRIMP_001` (키워드 매칭 성공 ✅)

### **Step 3: 사용자 프로필 대조 (Cross-Check)**

변환된 ID를 `user_preferences`와 비교합니다.

1.  **Check `ING_SHRIMP_001`**:
    - 마스터 DB 정보: `allergen_type = "SHELLFISH"`
    - 사용자 DB 정보: `primary_allergens`에 `"SHELLFISH"` 있음 -> 🚨 **WARN**
    - 사용자 상세 설정: `"severity": "SEVERE"` -> **DANGER**로 격상

### **Step 4: 최종 결과 반환**

```json
{
  "foodName": "Gambas al Ajillo",
  "safetyStatus": "DANGER",
  "warningMessage": "위험! 'Gambas'는 '새우(Shrimp)'의 일종으로, 고객님의 '갑각류(Shellfish)' 알러지와 충돌합니다. (위험도: 심각)"
}
```

---

## 4. 기대 효과 (Benefits)

1.  **키워드 파편화 해결**: "Gambas", "Ebi", "Prawn"을 모두 "새우"로 정확히 인식하여 놓치는 것을 방지합니다.
2.  **개인화된 정밀 분석**: "땅콩은 안 되지만 아몬드는 괜찮아", "오이는 싫지만 피클은 괜찮아" 같은 섬세한 요구사항 반영 가능.
3.  **데이터 확장성**: 새로운 알러지나 식재료가 생겨도 코드를 수정할 필요 없이 DB에 데이터만 추가하면 즉시 적용됩니다.
