import { ResultErrorInfo } from '../types/result.types';

const ERROR_FOOD_NAMES = new Set([
    'Error Analyzing Food',
    'Not Food',
    '분석 오류',
    'Analysis Error',
]);

export const isResultError = (foodName?: string): boolean => {
    if (!foodName) return false;
    return ERROR_FOOD_NAMES.has(foodName);
};

export const getResultErrorInfo = (foodName: string, rawResult = ''): ResultErrorInfo => {
    if (rawResult.includes('서버가 바쁩니다') || rawResult.includes('429') || rawResult.includes('많습니다')) {
        return {
            title: '잠시만 기다려주세요',
            desc: '지금 요청이 많아 분석이 지연되고 있어요.\n15~30초 후 다시 시도해주세요.',
            icon: 'time-outline',
        };
    }

    if (foodName === 'Not Food') {
        return {
            title: '음식을 찾을 수 없어요',
            desc: '이 이미지에서 음식을 인식하지 못했어요.\n다른 사진으로 시도해보세요.',
            icon: 'image-outline',
        };
    }

    return {
        title: '분석을 못했어요',
        desc: '일시적인 문제가 발생했어요.\n다시 시도해주세요.',
        icon: 'camera-outline',
    };
};
