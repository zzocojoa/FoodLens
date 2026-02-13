# 상업용 의류 누끼 추출 프로젝트 (공식 SAM 2)

## 개요

우리는 기존의 라이선스 문제가 있는 라이브러리(Ultralytics, AGPL)를 제거하고, **Meta(Facebook Research) 공식 라이브러리**를 사용하여 코드를 재구현했습니다.
이를 통해 결과물과 코드를 **Apache 2.0 라이선스 (상업적 이용 무료)** 하에 안전하게 사용할 수 있게 되었습니다.

## 적용된 기술

- **라이브러리**: `sam2` (공식 버전)
- **AI 모델**: `sam2.1_hiera_large.pt` (Meta에서 제공하는 고성능 모델)
- **위치 감지**: Gemini 2.0 Flash API (상의 위치 파악용)
- **하드웨어 가속**: Mac의 `MPS` (GPU) 또는 CUDA/CPU 지원.

## 사용 방법

### 상업용 안전 모드로 실행하기

```bash
python extract_clothing_sam3.py
```

- **입력 파일**: `image_1.jpg`
- **결과 파일**: `extracted_top_sam2_official.png`

## 라이선스 검증

- **SAM 2 코드**: MIT / Apache 2.0 (오픈소스)
- **Gemini API**: 유료 티어(Pay-as-you-go) 사용 시 결과물의 상업적 권리는 사용자에게 있음.
- **결론**: 이 스크립트에는 AGPL 같은 '전염성' 라이선스 의존성이 없습니다.

## 비즈니스 전략 요약

우리는 "10대 AI 스타일리스트" 서비스의 사업성을 분석했습니다.

- **관련 문서**: [사업 계획서](business_plan.md)
- **핵심 전략**: 월 정기구독 대신 **"부분 유료화(매일 무료) + 광고/토큰 모델"** 추천.
- **인프라**: 초기 비용 절감을 위해 Serverless GPU (RunPod 등) 활용.
