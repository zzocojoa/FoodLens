# P4 Runtime & Performance Guardrails

## Scope
- FastAPI runtime path에서 이벤트 루프 블로킹 가능성 감소
- 엔드포인트 오류 처리/로그 포맷 최소 표준화
- 부하 테스트 시나리오(실행 전 단계) 정의

## Implemented

### 1) Async endpoint CPU-bound offloading
- 대상 파일: `backend/server.py`
- 적용 내용:
  - 이미지 디코딩(`decode_upload_to_image`)을 `asyncio.to_thread` 경유로 실행
  - 동기 분석 호출(`analyze_food_json`, `analyze_label_json`, `analyze_barcode_ingredients`)을 threadpool로 분리
- 기대 효과:
  - FastAPI 이벤트 루프 블로킹 감소
  - 동시 요청 시 응답 지연 급증 리스크 완화

### 2) Runtime guardrail 공통 모듈
- 대상 파일: `backend/modules/runtime_guardrails.py`
- 적용 내용:
  - `run_in_threadpool` 공통 함수
  - `run_with_error_policy` 공통 예외 처리 래퍼
  - `ErrorCode` 표준 enum
  - request_id 기반 예외 로그 포맷

### 3) Startup/bootstrap 책임 분리 강화
- 대상 파일: `backend/server.py`
- 적용 내용:
  - import-time 전역 초기화 대신 `startup` 이벤트에서 서비스 초기화
  - `app.state` 기반 서비스 보관(`analyst`, `barcode_service`, `smart_router`)
  - `OPENAPI_EXPORT_ONLY=1` 모드에서 초기화 스킵 유지

## Error/Logging Standard (Current)
- 로그 필수 항목:
  - `endpoint`
  - `request_id`
  - `code` (`ErrorCode`)
  - `error`
- API 오류 메시지:
  - 분석 계열: `HTTPException(detail="... code=... request_id=...")`
  - 바코드 계열: 기존 contract 유지(`found=false`, `error=...`) + code/request_id 포함

## Load Test Scenarios (Planned)
- Scenario A: `/analyze` 10 RPS, 3분
  - 목표: p95 latency, error rate(5xx), CPU 사용량 측정
- Scenario B: `/analyze/smart` burst 30 concurrent, 1분
  - 목표: 라우터 분기 포함 시 이벤트 루프 정체 여부 확인
- Scenario C: `/lookup/barcode` + 알러지 분석 분기 혼합(70/30), 5분
  - 목표: 외부 API + 분석 혼합 경로 안정성 확인

## Operational Notes
- 본 단계는 "가드레일 적용 + 시나리오 정의"까지 완료 상태.
- 실제 부하 테스트 실행/임계치 확정은 운영 환경 API 키/모델 쿼터 조건에서 별도 수행.
