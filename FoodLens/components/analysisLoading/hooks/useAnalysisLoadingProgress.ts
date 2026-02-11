import { useEffect, useState } from 'react';
import { LONG_WAIT_THRESHOLD_MS, STEPS } from '../constants';
import { getMainMessage, getProgressWidth } from '../utils/analysisLoadingFormatters';

type UseAnalysisLoadingProgressParams = {
    isError: boolean;
    manualStep?: number;
    manualProgress?: number;
};

export function useAnalysisLoadingProgress({
    isError,
    manualStep,
    manualProgress,
}: UseAnalysisLoadingProgressParams) {
    const [step, setStep] = useState(0);
    const [isLongWait, setIsLongWait] = useState(false);

    const isManual = typeof manualStep === 'number';
    const currentStep = isManual && manualStep !== undefined ? manualStep : step;

    useEffect(() => {
        if (!isManual) {
            const interval = setInterval(() => {
                setStep((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
            }, 1500);

            return () => clearInterval(interval);
        }

        return undefined;
    }, [isManual]);

    useEffect(() => {
        setIsLongWait(false);

        let timer: ReturnType<typeof setTimeout> | undefined;
        if (currentStep === 2) {
            timer = setTimeout(() => {
                setIsLongWait(true);
            }, LONG_WAIT_THRESHOLD_MS);
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [currentStep]);

    return {
        currentStep,
        isLongWait,
        mainMessage: getMainMessage(isError, isLongWait, currentStep),
        progressWidth: getProgressWidth(isError, isManual, currentStep, manualProgress),
    };
}
