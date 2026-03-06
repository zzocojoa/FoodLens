import { ResultErrorInfo } from '../types/result.types';

type TranslateFn = (key: string, fallback?: string) => string;

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

export const getResultErrorInfo = (
    foodName: string,
    rawResult = '',
    t?: TranslateFn
): ResultErrorInfo => {
    const translate: TranslateFn = t ?? ((_, fallback = '') => fallback);

    if (rawResult.includes('서버가 바쁩니다') || rawResult.includes('429') || rawResult.includes('많습니다')) {
        return {
            title: translate('result.error.busy.title', 'Please wait a moment'),
            desc: translate(
                'result.error.busy.desc',
                'Analysis is delayed because the server is busy.\nPlease try again in 15-30 seconds.'
            ),
            icon: 'time-outline',
        };
    }

    if (foodName === 'Not Food') {
        return {
            title: translate('result.error.notFood.title', 'Food not detected'),
            desc: translate(
                'result.error.notFood.desc',
                "We couldn't detect food in this image.\nPlease try another photo."
            ),
            icon: 'image-outline',
        };
    }

    return {
        title: translate('result.error.generic.title', 'Could not analyze'),
        desc: translate('result.error.generic.desc', 'A temporary issue occurred.\nPlease try again.'),
        icon: 'camera-outline',
    };
};
