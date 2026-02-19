# FoodLens 프로덕션 배포 — Task Checklist

## 🔒 API Key Security ✅

- [x] `.gitignore` 수정 — `.env` 추적 방지
- [x] `FoodLens/.env` 정리 — 서버 URL만 유지
- [x] `.env.example` 생성 (루트 + FoodLens)
- [x] 테스트 통과 (42/44)
- [ ] 키 로테이션 (사용자 수동 — GCP SA, GitHub PAT, Gemini, USDA, FDA 등)
- [ ] GCP API 키 IP/API 제한 (사용자 수동)

## 🔴 P0 — 스토어 배포 차단 요소

- [x] P0-3: 카메라/위치/갤러리 권한 문구 (`app.config.js`)
- [x] P0-1: 개인정보처리방침 & 이용약관
- [ ] P0-2: 계정 삭제 기능 (Apple 필수)
- [ ] P0-4: 접근성(a11y) 최소 구현

## 🟠 P1 — 프로덕션 안정성

- [ ] P1-5: Render 유료 전환 (사용자 수동)
- [ ] P1-6: 서버 DB 도입
- [ ] P1-7: 사용자 인증
- [x] P1-8: 이미지 압축 (`imageCompress.ts`, 1536px/JPEG 80%)
- [x] P1-9: Sentry 에러 추적 (프론트 `sentry.ts` + 백엔드 `sentry-sdk[fastapi]`)
- [ ] P1-10: CORS 보안 헤더

## 🟡 P2 — UX 품질

- [x] P2-1: 온보딩 플로우
  - [x] 필수 권한 단계 최적화 (위치 권한 추가)
  - [x] 레이아웃 및 스크롤 버그 수정
  - [ ] 커스텀 알레르기 검색 및 추가 기능 (AllergiesStep)
- [ ] P2-2: 클라우드 동기화
- [ ] P2-3: OTA 업데이트 (EAS Update)
- [ ] P2-4: 앱 리뷰 요청
- [ ] P2-5: Analytics
