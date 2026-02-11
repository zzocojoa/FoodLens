import { STEPS } from '../constants';

export const getMainMessage = (isError: boolean, isLongWait: boolean, currentStep: number): string => {
    if (isError) return 'ANALYSIS FAILED';
    if (isLongWait && currentStep === 2) return 'SERVER WARMING UP...';
    return STEPS[currentStep] ?? STEPS[STEPS.length - 1];
};

export const getProgressWidth = (
    isError: boolean,
    isManual: boolean,
    currentStep: number,
    manualProgress?: number
): string => {
    if (!isManual || manualProgress === undefined) {
        return isError ? '100%' : `${((currentStep + 1) / STEPS.length) * 100}%`;
    }

    if (currentStep === 1) {
        const startOffset = 0.25;
        const uploadRange = 0.5;
        const calculated = startOffset + manualProgress * uploadRange;
        return `${Math.min(calculated * 100, 75)}%`;
    }

    if (currentStep > 1) {
        return currentStep === 2 ? '85%' : '100%';
    }

    return '10%';
};
