# CTO 기술 분석 보고서: 식재료 매핑 DB 도입에 따른 영향성 평가

**작성자:** FoodLens 개발 이사 (Virtual CTO)
**검토 대상:** `/docs/plans/allergy-ingredient-db-mapping.md` (식재료 매핑 및 사용자 알러지 DB 설계안)

---

## 1. 개요 (Executive Summary)

본 설계안은 기존의 **"AI 텍스트 기반 추론 (Approximate Inference)"** 방식을 **"데이터 기반 결정론적 매칭 (Deterministic Matching)"** 방식으로 전환하는 것을 골자로 합니다.
이는 **정확도와 안전성을 획기적으로 높일 수 있으나**, 초기 구축 비용과 운영 복잡도가 상승하는 Trade-off가 존재합니다.

---

## 2. 장점 (Pros) - Why we should do this

### 🚀 1. '환각(Hallucination)'에 대한 완벽한 통제 (Safety)

- **현재:** AI가 "Shrimp"를 보고도 "User is allergic to Crabs"라고 잘못 판단할 가능성이 존재합니다.
- **변경 후:** `ING_SHRIMP_001` → `Category: SEAFOOD` → `User Preference: SEAFOOD_ALLERGY`의 로직이 **코드 레벨에서 엄격하게 검증**되므로, 안전 사고를 원천 차단할 수 있습니다.

### 🌐 2. 다국어 확장성 확보 (Scalability)

- **현재:** "Gambas"(스페인어 새우), "Kung"(태국어 새우) 등 모든 언어 케이스를 프롬프트에 넣을 수 없습니다.
- **변경 후:** `names` 배열에 다국어 동의어만 추가하면(DB 업데이트), **코드 수정 없이** 전 세계 모든 언어의 "새우"를 인식할 수 있습니다.

### 🎯 3. 초개인화 (Hyper-Personalization)

- **현재:** "갑각류 알러지"라는 큰 범주만 처리 가능.
- **변경 후:** "게는 안 되지만, 새우는 괜찮아요" 또는 "익힌 건 괜찮아요" 같은 **조건부 회피** 로직을 수용할 수 있어, 사용자 경험(UX)이 극대화됩니다.

---

## 3. 단점 및 리스크 (Cons & Risks) - What causes headache

### 💸 1. 데이터 구축 및 유지보수 비용 (High Maintenance)

- **Problem:** 세상에는 수천 가지 식재료가 있습니다. 초기 마스터 DB(`ingredients_master`)를 구축하는 데 상당한 인력이 필요합니다.
- **Risk:** 신종 식재료나 지역 특산물이 DB에 없으면 "Unknown Ingredient"로 처리되어 분석 실패가 뜰 수 있습니다. (Cold Start 문제)

### 🐢 2. 검색 복잡도 증가 및 성능 저하 (Latency)

- **Problem:** AI가 텍스트를 뱉으면 -> 서버에서 키워드 검색 -> 매핑 -> 사용자 대조의 과정이 추가됩니다.
- **Risk:** 동의어 매칭(`search_keywords`) 알고리즘이 비효율적일 경우, 응답 속도가 느려질 수 있습니다.

### 📡 3. 오프라인 동작 제한 (Connectivity Dependency)

- **Problem:** 현재 앱은 로컬 로직 위주지만, 이 방식은 서버 DB 조회가 필수적입니다.
- **Risk:** 인터넷이 느린 여행지에서 DB 조회가 실패하면 알러지 판단 기능을 사용할 수 없게 됩니다. (Offline-First 전략 수정 필요)

---

## 4. CTO 제언 (Recommendation)

**"하이브리드 접근 (Hybrid Approach)"을 강력히 권장합니다.**

1.  **Phase 1 (핵심 재료만 도입):**
    - 모든 식재료를 DB화 하려 하지 말고, **Top 20 알러지 유발 물질(계란, 우유, 땅콩, 갑각류 등)**만 우선 DB화하여 "Critical Safety Layer"를 구축하십시오.
    - 나머지 일반 식재료는 기존처럼 AI 추론에 맡깁니다.

2.  **Phase 2 (로컬 캐싱):**
    - 서버 의존성을 줄이기 위해, 앱 실행 시 `ingredients_master`의 경량화 버전(Lite DB)을 폰에 다운로드하여 **로컬에서 매칭**하도록 설계하십시오.

✅ **결론:** 안전이 최우선인 '알러지' 앱의 특성상 본 설계안은 **필수불가결한 진화 방향**입니다. 단, 운영 부담을 줄이기 위해 단계적으로 도입하십시오.
