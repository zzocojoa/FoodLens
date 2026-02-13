# 공식 SAM 2 라이브러리 마이그레이션 계획

## 목표

AGPL 라이선스인 `ultralytics`를 제거하고, 상업적으로 안전한(Apache 2.0) Meta 공식 `sam2` 라이브러리로 교체합니다.

## 전략

1.  **설치**: Facebook Research GitHub 저장소의 `sam2`를 직접 설치합니다.
2.  **모델 로딩**: `sam2.1_hiera_large.pt` 체크포인트 파일을 수동으로 다운로드합니다.
3.  **추론 (Inference)**:
    - `SAM2ImagePredictor` 클래스 사용.
    - Gemini가 찾은 BBox를 입력으로 전달.
    - 마스크 생성.

## 의존성

- `sam2` (git+https://github.com/facebookresearch/sam2.git)
- `hydra-core`

## 파일 변경

#### [수정] [extract_clothing_sam3.py](file:///Users/beatlefeed/Documents/AI-test/extract_clothing_sam3.py)

- 공식 API를 사용하도록 코드 전면 수정.

## 검증

- 새 스크립트 실행.
- 라이선스 제약 없는 무료 코드 경로(Free License Path)에서도 동일한 품질이 나오는지 확인.
