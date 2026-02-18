# CTO 설계안: Lean User Feedback System (비용 최적화 모델)

**작성자:** FoodLens 개발 이사 (Virtual CTO)
**주제:** 복잡한 DB 구축 없이 데이터 파이프라인(Data Pipeline) 확보하기

---

## 1. 개요 (Executive Summary)

### **Goal**

- 초기 스타트업 단계에서 **"최소 비용으로 최대 효과(Low Cost, High Impact)"**를 내는 데이터 수집 구조 설계.
- 복잡한 RDBMS/NoSQL 설계 없이, **"사용자 제보(User Report)"**를 통해 AI 모델의 약점(Edge Case)을 파악하고 개선하는 **선순환 구조(Feedback Loop)** 구축.

### **Strategy: "The 1-Click Report"**

- 사용자가 분석 결과에 불만이 있을 때, **단 1번의 클릭**으로 개발팀에게 데이터를 쏴주는 초경량 기능을 구현합니다.
- 이 데이터는 즉시 DB에 쌓이는 게 아니라, `Slack`, `Email`, 또는 `S3/Firestore`의 단순 로그(Log) 형태로 저장되어 **"후처리(Post-processing)"**를 기다립니다.

---

## 2. 사용자 경험 (UX Flow)

### Step 1. 결과 화면 (`ResultScreen`)

AI 분석 결과 하단에 작고 부담 없는 버튼을 배치합니다.

- **UI:** `[ 🏳️ 오분석 신고 ]` 또는 `[ 🐞 틀렸어요 ]` (Text Button)
- **위치:** '다시 찍기' 버튼 옆이나 스크롤 최하단.

### Step 2. 신고 모달 (Bottom Sheet)

버튼 클릭 시 가장 단순한 형태의 입력창이 뜹니다.

- **옵션 선택 (Radio):**
  - `[ ]` 음식 이름이 틀렸어요.
  - `[ ]` 없는 재료가 나왔어요.
  - `[ ]` 알러지 위험을 놓쳤어요! (중요 🔥)
- **텍스트 입력 (Optional):** "이거 고기 육수 아니고 채수예요."
- **Action:** `[ 보내기 ]`

### Step 3. 완료 (Toast)

- "소중한 제보 감사합니다! AI가 배우는 중입니다 🤖"

---

## 3. 기술 아키텍처 (Technical Architecture)

가장 간단하고 비용이 안 드는 **3단계 접근법**을 제안합니다.

### Phase 1: "Slack 알림" (Serverless MVP) 🚀

서버 DB도 필요 없습니다. 그냥 개발자 슬랙으로 쏴버립니다.

1.  앱에서 `POST /feedback` 요청.
2.  서버(`FastAPI`)가 받아서 `Slack Webhook` 호출.
3.  **Slack 채널 `#ai-feedback`에 이미지와 함께 알림 도착.**

    > 🚨 **오분석 신고**
    > **User:** user_123
    > **AI 결과:** "Beef Soup"
    > **사용자 의견:** "이거 콩국수(Soybean Noodle)예요."
    > **이미지:** [링크]
    - **장점:** 개발자가 실시간으로 확인하고, "아, 콩국수 못 맞추네?" 하고 바로 인지 가능.
    - **비용:** 0원.

### Phase 2: "Firestore Log" (Data Lake) 💾

데이터가 쌓이기 시작하면, 슬랙은 시끄러우니 클라우드에 로그로 저장합니다.

- **Collection:** `feedback_logs` (스키마 없이 막 넣음)
- **Data:**
  ```json
  {
    "timestamp": "2024-02-18T12:00:00Z",
    "original_image_url": "gs://...",
    "ai_result_json": {...},
    "user_comment": "육수 아님",
    "correction_type": "WRONG_INGREDIENT"
  }
  ```
- **활용:** 일주일에 한 번씩 이 로그를 훑어보고(`Export JSON`), 자주 틀리는 음식 패턴을 파악합니다.

### Phase 3: "AI 재학습" (Fine-tuning) 🧠

데이터가 1,000건 이상 모이면, 이제 진짜 AI를 가르칩니다.

1.  이 로그들을 `Gemini` 학습 데이터셋 포맷으로 변환. (Input: 이미지, Output: 사용자가 알려준 정답)
2.  Google Vertex AI에서 모델 파인튜닝(Fine-tuning) 수행.
3.  **Result:** "이제 우리 앱은 콩국수 기가 막히게 맞춘다!"

---

## 4. CTO의 제언 (Conclusion)

**"완벽한 DB 설계보다, '지금 당장' 사용자의 목소리를 듣는 게 100배 중요합니다."**

1.  **Just Do It:** 지금 당장 `ResultScreen.tsx`에 신고 버튼 하나만 만드세요.
2.  **No DB:** 복잡한 테이블 만들지 말고, 일단 **Slack이나 이메일**로 받으세요.
3.  **Manual Check:** 하루에 신고 10건도 안 들어옵니다. 직접 눈으로 보고 고치는 게 가장 빠릅니다.

이것이 초기 스타트업이 생존하고 성장하는 가장 효율적인 **"Lean Startup"** 방식입니다.
