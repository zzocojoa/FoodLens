# 🔬 알레르기 & 사용자 프로필 리서치 — FoodLens 온보딩

> [!IMPORTANT]
> **최종 결정**: 참깨 추가 + 심각도 3단계 + 성별(남/여) + 출생연도(DateTimePicker spinner)

## 1. 온보딩 수집 데이터

| 우선순위 | 항목                          | 상태 | 온보딩 Step |
| :------: | :---------------------------- | :--: | :---------: |
|    🔴    | 알레르기 종류 (9종)           |  ✅  |      4      |
|    🔴    | 심각도 (Mild/Moderate/Severe) |  ✅  |      4      |
|    🔴    | 성별 (남성/여성)              |  ✅  |      2      |
|    🔴    | 출생연도 (DateTimePicker)     |  ✅  |      2      |
|    🟡    | 교차오염 민감도               |  ❌  |    향후     |
|    🟢    | 가족 프로필                   |  ❌  |    향후     |

## 2. 나이 수집 — 출생연도만 저장

| 방식          | 규정 리스크                  | 채택 |
| :------------ | :--------------------------- | :--: |
| **출생연도**  | ✅ 낮음 (GDPR 데이터 최소화) |  ✅  |
| 전체 생년월일 | 🔴 높음 (HIPAA PHI)          |  ❌  |

- UI: `@react-native-community/datetimepicker` spinner (`display="spinner"`)
- `locale` prop으로 앱 언어에 따라 자동 포맷 (ko→년/월/일, en→Month/Day/Year)
- 저장 시 **연도만 추출**하여 `birthYear: number`로 저장

## 3. 성별 — 남성/여성 2개

| 옵션             | 비고 |
| :--------------- | :--- |
| 👨 남성 (Male)   |      |
| 👩 여성 (Female) |      |

## 4. 알레르기 목록 (9종)

`egg`, `milk`, `peanut`, `shellfish`, `wheat`, `soy`, `treenut`, `fish`, `sesame` ✅

## 5. 심각도 3단계

| Level | 라벨        | UI     |
| :---: | :---------- | :----- |
|   1   | ⚠️ Mild     | 노란색 |
|   2   | 🔶 Moderate | 주황색 |
|   3   | 🔴 Severe   | 빨간색 |
