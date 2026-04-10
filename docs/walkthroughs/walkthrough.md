# FoodLens 제품 워크스루

이 문서는 데모, QA, 스토어 심사, 릴리스 리허설에서 **무엇을 어떤 순서로 보여주고 검증할지**를 정리한 기준 문서입니다.

## 1. 시작 화면과 로그인

- 앱 실행
- Google / Kakao / Email 로그인 진입점 확인
- Help Center / Contact Support / Privacy Policy / Terms of Service 진입 가능 여부 확인

## 2. 프로필과 개인화

- 표시 이름, 프로필 이미지, 언어 설정
- 알레르기, 식이 제한, 심각도 설정
- 여행자 카드 언어 설정

핵심 메시지:

- FoodLens는 결과를 일반 템플릿으로 보여주는 앱이 아니라, **사용자 프로필을 반영해 판단을 돕는 앱**입니다.

## 3. 라벨 분석

- 포장식품 라벨 사진 촬영
- 성분, 영양, 위험도, 요약 문구 확인
- `request_id` 또는 결과 식별 정보 존재 여부 확인

## 4. 음식 사진 분석

- 일반 음식 사진 촬영
- 안전도와 요약 문구 확인
- 결과 화면 전환 속도 및 재시도 흐름 확인

## 5. 바코드 분석

- 바코드 스캔
- 상품명/성분/위험도/요약 확인

## 6. 결과 후속 행동

- 히스토리에 저장
- 공유
- 오분석 신고 또는 Contact Support 진입

핵심 메시지:

- 분석이 끝나면 사용자는 **저장, 재확인, 수정 요청**을 바로 할 수 있어야 합니다.

## 7. 히스토리와 푸드 패스포트

- 저장된 결과 다시 열기
- 삭제
- 지도/국가 단위 기록 확인
- 다른 기기 또는 재실행 후에도 서버 저장값이 유지되는지 확인

## 8. Support & Policies

- FAQ
- Contact Support
- Privacy Policy
- Terms of Service
- Account & Data 삭제 흐름

## 9. 계정 및 데이터 삭제

- Delete My Data
- Delete Account
- 삭제 요청 상태 확인

## 10. 릴리스 리허설에서 꼭 남길 증적

- Android / iOS 실기기 스크린샷 또는 짧은 영상
- store evidence
- post-deploy smoke 결과
- rollback rehearsal 결과
- 발견 이슈 및 최종 판정

## 11. 연결 문서

- 제품 정의: [`/docs/product/project.md`](../product/project.md)
- 사업 방향: [`/docs/product/business_plan.md`](../product/business_plan.md)
- API 계약: [`/docs/contracts/api-contracts.md`](../contracts/api-contracts.md)
- 출시 게이트: [`/docs/roadmap/phase-6-release-gate-execution.md`](../roadmap/phase-6-release-gate-execution.md)
