# /history 지도 데이터 표시 및 로직 플로우

FoodLens 프로젝트의 히스토리 화면(`/history`)에서 지도가 데이터를 표시하는 방식과 그 내부 로직에 대한 전수 검사 결과입니다.

## 1. 데이터 소스 및 변환 (Data Source & Transformation)

### 1-1. 저장소 (Storage)

- **SafeStorage (MMKV)**: 모든 분석 기록(`AnalysisRecord`)은 로컬 MMKV 저장소에 JSON 형태로 저장됩니다.
- **Service Layer**: `AnalysisService.getAllAnalyses`를 통해 저장된 데이터를 불러옵니다.

### 1-2. 쿼리 및 데이터 처리 (Hooks)

1. **`useHistoryQuery`**: TanStack Query를 사용하여 비동기적으로 데이터를 가져오고 캐싱합니다.
2. **`useHistoryData`**: 가져온 원본 기록들을 화면에 적합한 형태로 가공합니다.
   - **`aggregateHistoryByCountry`**: 국가(Country)별로 데이터를 그룹화합니다.
   - **위치 검증**: `hasValidLocation` 유틸리티를 사용하여 위도/경도가 존재하는 데이터만 지도 표시 대상으로 분류합니다.
   - **이미지 처리**: `resolveImageUri`를 통해 로컬 파일 시스템의 이미지 경로를 앱에서 표시 가능한 URI로 변환합니다.

## 2. 지도 렌더링 엔진 (Map Rendering Engine)

### 2-1. 컴포넌트 구조

- **`HistoryMap`**: 전체 지도를 관리하는 메인 컴포넌트입니다.
- **`HistoryMapMarkers`**: 개별 핀(Marker)과 클러스터(Cluster)를 실제 렌더링하는 컴포넌트입니다.

### 2-2. 상태 관리 (`useHistoryMapState`)

- **`activeRegion`**: 사용자가 현재 보고 있는 지도의 영역을 추적합니다.
- **성능 최적화**: `MAX_RENDER_MARKERS` 상수를 사용하여 렌더링되는 마커의 개수를 제한하여 성능 저하를 방지합니다.

### 2-3. 클러스터링 로직 (`useHistoryMapDerivedData`)

- **Supercluster**: `supercluster` 라이브러리를 사용하여 다수의 마커를 줌 레벨에 따라 하나의 배지(Cluster)로 묶어 표시합니다.
- **동적 마커 생성**: `flattenMarkers` 함수를 통해 국가별로 그룹화된 데이터를 개별 마커 리스트로 평탄화(Flatten)한 후, 현재 지도 영역(BBox)에 포함된 마커만 계산하여 노출합니다.

## 3. 데이터 흐름도 (Data Flow Diagram)

```mermaid
graph TD
    A[MMKV Storage] -->|getAllAnalyses| B(AnalysisService)
    B -->|useHistoryQuery| C(useHistoryData)
    C -->|aggregateHistoryByCountry| D[archiveData: CountryData[]]
    D -->|HistoryMap| E(useHistoryMapDerivedData)
    E -->|flattenMarkers| F[markers: MapMarker[]]
    F -->|Supercluster| G[clusteredItems]
    G -->|HistoryMapMarkers| H[React Native MapView]
```

## 4. 주요 핵심 로직 요약 (Core Logic Summary)

| 단계       | 파일/함수                                           | 주요 역할                                                       |
| :--------- | :-------------------------------------------------- | :-------------------------------------------------------------- |
| **추출**   | `historyDataUtils.ts` / `aggregateHistoryByCountry` | `AnalysisRecord`에서 위경도를 추출하고 국가별로 묶음            |
| **초기화** | `historyDataUtils.ts` / `buildInitialRegion`        | 저장된 데이터 중 첫 번째 유효 좌표를 찾아 지도의 시작 위치 설정 |
| **가공**   | `useHistoryMapDerivedData.ts`                       | 줌 레벨 및 현재 영역에 따른 클러스터/개별 마커 계산             |
| **표시**   | `HistoryMapMarkers.tsx`                             | 음식 이미지 썸네일 또는 알러지 단계별 이모지를 핀에 표시        |

---

_Last Updated: 2026-02-14_
