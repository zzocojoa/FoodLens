import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import { AnalysisService } from '@/services/analysisService';
import { HapticsService } from '@/services/haptics';
import { TEST_UID } from '../constants/result.constants';

export const useDateUpdateAction = (
    savedRecordId: string | null,
    updateTimestamp: (date: Date) => void,
    closeEditor: () => void
) => {
    return React.useCallback(
        async (newDate: Date) => {
            updateTimestamp(newDate);

            if (savedRecordId) {
                await AnalysisService.updateAnalysisTimestamp(TEST_UID, savedRecordId, newDate);
                HapticsService.success();
            }

            closeEditor();
        },
        [savedRecordId, updateTimestamp, closeEditor]
    );
};

export const useNewResultHaptic = (resultExists: boolean) => {
    const params = useLocalSearchParams();

    React.useEffect(() => {
        if (resultExists && params['isNew'] === 'true') {
            const timer = setTimeout(() => {
                HapticsService.success();
            }, 300);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [resultExists, params['isNew']]);
};

