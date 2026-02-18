# AI 분석 결과와 식재료 DB 불일치 시 처리 전략 (Mismatch Handling Strategy)

**상황 (Scenario):**

- **AI 분석 결과:** "Vegetable Kimbap" (재료: 시금치, 당근, 단무지)
- **식재료 DB 매핑:** "Kimbap"은 기본적으로 "Ham(Pork)", "Egg"를 포함한다고 정의됨.

AI가 눈에 보이는 것만 판단하여 "야채 김밥"이라고 했지만, DB상 김밥은 고위험군(햄, 계란)을 포함할 가능성이 높을 때 어떻게 처리할 것인가에 대한 전략입니다.

---

## 🏗️ 1. 하이브리드 검증 로직 (Hybrid Validation Logic)

우리는 **"안전 제일(Safety First)"** 원칙에 따라, 두 정보 중 **더 위험한(보수적인) 쪽을 따르는 알고리즘**을 적용합니다.

### A. 합집합 전략 (Union Approach - Recommended) ✅

AI가 본 것(`Detected`)과 DB에 정의된 표준 레시피(`Recipe`)를 **모두 합칩니다**. 여행자 입장에서는 "혹시 모를 위험"을 아는 것이 중요하기 때문입니다.

- **AI:** "Spinach", "Carrot"
- **DB:** "Ham", "Egg", "Rice"
- **최종 결과:** "Spinach", "Carrot", "Ham(⚠️)", "Egg(⚠️)", "Rice"
  - _UI 표시:_ "Ham과 Egg가 보이지 않지만, 일반적인 김밥에는 포함될 수 있습니다." (Potential Allergens)

### B. 신뢰도 점수 기반 가중치 (Confidence Scoring)

AI의 확신(`Confidence Score`)이 매우 높으면 AI를 믿고, 낮으면 DB를 믿습니다.

- **Case 1 (AI 확신 99%):** "이건 확실히 '비건 김밥'입니다. 햄이 없습니다." -> **AI 승리**
- **Case 2 (AI 확신 60%):** "김밥 같긴 한데 내용물은 잘 안 보여요." -> **DB 승리 (햄 경고 띄움)**

---

## 🛑 2. 불일치 유형별 대응 (Mismatch Types)

### Type A: Missing Ingredient (AI가 못 본 재료)

- **상황:** AI는 "육수"를 못 봤지만, DB상 "라멘"에는 "Pork Broth"가 필수.
- **대응:** **DB 우선**. "눈에 보이지 않지만 돼지고기 육수가 사용되었을 수 있습니다." 경고 노출.

### Type B: Unexpected Ingredient (AI가 더 많이 본 재료)

- **상황:** DB상 "샐러드"에는 땅콩이 없는데, AI가 "땅콩 토핑"을 감지함.
- **대응:** **AI 우선**. DB는 표준 레시피일 뿐, 실제 요리사의 변형(Variation)을 다 담을 수 없으므로 AI가 발견한 시각적 증거를 우선시합니다.

### Type C: Contradiction (정면 충돌)

- **상황:** AI는 "Chicken Burger"라고 했는데, DB 매핑은 "Beef Patty"로 되어 있음.
- **대응:** **"Unknown/Custom" 처리**. "메뉴 이름은 치킨 버거지만, DB 정보와 충돌합니다. 직원에게 직접 문의하세요." 라는 중립적인 경고 문구 출력.

---

## 🧪 3. 사용자 피드백 루프 활용

이런 불일치가 발생했을 때, 사용자에게 물어보는 것이 가장 확실합니다.

> "AI는 햄이 없다고 분석했지만, 보통 김밥에는 햄이 들어갑니다. 실제로 햄이 있었나요?"
> [ 예, 있었어요 ] / [ 아니요, 비건 메뉴였어요 ]

이 응답을 서버에 저장하여(`analysis_feedback`), 추후 데이터베이스의 정교함(예: '비건 김밥' 별도 메뉴 분리)을 업데이트하는 데 사용합니다.
