export const TEST_UID = 'test-user-v1';
export const DEFAULT_ISO_CODE = 'US';

export const CAMERA_ERROR_MESSAGES = {
    missingImage: '이미지 정보를 불러올 수 없습니다. 다시 시도해주세요.',
    locationUnavailable:
        '위치 권한이 없거나 가져올 수 없습니다. 위치 기반 알러지 필터가 적용되지 않을 수 있습니다.',
    offline: '인터넷 연결을 확인해주세요.',
    file: '이미지 파일을 불러올 수 없습니다. 다른 사진을 선택해주세요.',
    analysis: '서버 연결에 문제가 있습니다. 네트워크를 확인하고 다시 시도해주세요.',
} as const;

