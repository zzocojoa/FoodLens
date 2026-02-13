# I18N-P1-T013 릴리즈 게이트

작성일: 2026-02-14  
taskID: `I18N-P1-T013`

## 목적
- 다국어 릴리즈 전 승인 기준을 코드 검사 + 수동 QA 기준으로 고정한다.

## 자동 게이트 (필수)
- 실행 명령: `npm run i18n:release-gate`
- 내부 실행 순서:
  1. `npm run i18n:verify`
  2. `npx tsc --noEmit`
  3. `npm run lint`

### 통과 기준
- 모든 명령이 exit code 0
- i18n 키 누락/하드코딩 UI 문자열 검출 0건
- TypeScript error 0건
- ESLint error 0건

## 수동 QA 게이트 (필수)
- 기준 문서: `docs/plans/i18n-regression-scenarios.md`
- 필수 통과 시나리오:
  - `I18N-P1-T012-S01`
  - `I18N-P1-T012-S02`
  - `I18N-P1-T012-S03`
  - `I18N-P1-T012-S04`

## 승인 체크리스트
- [ ] 자동 게이트 통과 로그 첨부
- [ ] EN 전환 기준 핵심 플로우 점검 완료
- [ ] KO 전환 기준 핵심 플로우 점검 완료
- [ ] 결과 요약/경고 문구 언어 혼재 없음 확인
- [ ] 릴리즈 승인자 확인

## 실패 시 처리 규칙
- 자동 게이트 실패 시: 배포 보류, 실패 항목 우선 수정
- 수동 QA 실패 시: 재현 절차/스크린샷 기록 후 수정 배포 후보 재검증

## Evidence 템플릿
- 빌드 SHA:
- 실행 일시:
- 실행자:
- 자동 게이트 결과: PASS/FAIL
- 수동 QA 결과: PASS/FAIL
- 이슈 링크:
