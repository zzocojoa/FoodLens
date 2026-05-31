# FoodLens 문서 인덱스

이 문서는 **현재 운영/제품 기준 문서**와 **역사성 문서**를 구분하기 위한 진입점입니다.

## 현재 기준 문서

- 제품 정의(PRD): [`/docs/product/project.md`](./product/project.md)
- 사업 방향: [`/docs/product/business_plan.md`](./product/business_plan.md)
- 릴리스 노트: [`/CHANGELOG.md`](../CHANGELOG.md)
- API 계약: [`/docs/contracts/api-contracts.md`](./contracts/api-contracts.md)
- OAuth 보안 운영 런북: [`/docs/operations/oauth-security-runbook.md`](./operations/oauth-security-runbook.md)
- OAuth App/Universal Links 도메인 체크리스트: [`/docs/operations/oauth-app-link-domain-checklist.md`](./operations/oauth-app-link-domain-checklist.md)
- 로그아웃 revoke/session threat model: [`/docs/security/logout-revoke-session-threat-model.md`](./security/logout-revoke-session-threat-model.md)
- 로컬 삭제 footprint threat model: [`/docs/security/local-deletion-footprint-threat-model.md`](./security/local-deletion-footprint-threat-model.md)
- 아키텍처 요약: [`/docs/architecture-overview.md`](./architecture-overview.md)
- 엔지니어링 리뷰: [`/docs/architecture/plan-eng-review-2026-04-09.md`](./architecture/plan-eng-review-2026-04-09.md)
- 스킬 요청 플레이북: [`/docs/technical/skills_usage_guide.md`](./technical/skills_usage_guide.md)
- 출시 게이트/운영 리허설: [`/docs/roadmap/phase-6-release-gate-execution.md`](./roadmap/phase-6-release-gate-execution.md)
- PR #173 모바일 롤아웃 증거/결정: [`/docs/operations/pr173-mobile-rollout-decision-2026-05-31.md`](./operations/pr173-mobile-rollout-decision-2026-05-31.md)
- 개인정보처리방침: [`/docs/privacy-policy/index.md`](./privacy-policy/index.md)
  - 언어별 문서: [`en`](./privacy-policy/en/index.md), [`ja`](./privacy-policy/ja/index.md), [`zh-Hans`](./privacy-policy/zh-Hans/index.md)
- 이용약관: [`/docs/terms-of-service/index.md`](./terms-of-service/index.md)
  - 언어별 문서: [`en`](./terms-of-service/en/index.md), [`ja`](./terms-of-service/ja/index.md), [`zh-Hans`](./terms-of-service/zh-Hans/index.md)
- 제품 워크스루: [`/docs/walkthroughs/walkthrough.md`](./walkthroughs/walkthrough.md)

## 역사성 문서

다음 경로는 특정 시점의 계획, 감사, 실험, 레거시 산출물을 포함할 수 있습니다.

- `docs/plans/`
- `docs/audit/`
- `docs/legacy/`
- 일부 `docs/design/`, `docs/research/`

이 문서들은 참고 자료로는 유효할 수 있지만, **현재 구현/운영 truth**로 직접 해석하면 안 됩니다. 현재 판단은 항상 다음 우선순위를 따릅니다.

1. 코드와 실제 배포 설정
2. API 계약/아키텍처/법률/출시 게이트 기준 문서
3. 역사성 계획 문서
