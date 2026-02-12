import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AnalysisService } from '@/services/analysisService';
import { HapticsService } from '@/services/haptics';
import { useAnalysisData } from '@/hooks/result/useAnalysisData';
import { useAutoSave } from '@/hooks/result/useAutoSave';
import { usePinLayout } from '@/hooks/result/usePinLayout';
import { useResultUI } from '@/hooks/result/useResultUI';
import { TEST_UID } from '../constants/result.constants';
import { getResultErrorInfo, isResultError } from '../utils/resultError';

export function useResultScreen() {
    const params = useLocalSearchParams();

    const {
        isRestoring,
        loaded,
        result,
        locationData,
        imageSource,
        rawImageUri,
        displayImageUri,
        timestamp,
        updateTimestamp,
        imageDimensions,
    } = useAnalysisData();

    const [savedRecordId, setSavedRecordId] = React.useState<string | null>(null);
    const [isDateEditOpen, setIsDateEditOpen] = React.useState(false);

    useAutoSave(result, locationData, rawImageUri, timestamp, (savedRecord) => {
        setSavedRecordId(savedRecord.id);
    });

    const handleDateUpdate = React.useCallback(
        async (newDate: Date) => {
            updateTimestamp(newDate);

            if (savedRecordId) {
                await AnalysisService.updateAnalysisTimestamp(TEST_UID, savedRecordId, newDate);
                HapticsService.success();
            }
            setIsDateEditOpen(false);
        },
        [savedRecordId, updateTimestamp]
    );

    const { pins, layoutStyle } = usePinLayout(
        result?.ingredients, 
        displayImageUri, 
        !(result?.isBarcode || params.isBarcode === 'true'), // Hide pins if barcode
        imageDimensions
    );

    const {
        scrollY,
        scrollHandler,
        imageAnimatedStyle,
        headerOverlayStyle,
        isBreakdownOpen,
        setIsBreakdownOpen,
    } = useResultUI();

    React.useEffect(() => {
        if (result && params.isNew === 'true') {
            const timer = setTimeout(() => {
                HapticsService.success();
            }, 300);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [result, params.isNew]);

    const isError = isResultError(result?.foodName);
    const errorInfo = result ? getResultErrorInfo(result.foodName, result.raw_result || '') : null;

    return {
        isRestoring,
        loaded,
        result,
        locationData,
        imageSource,
        rawImageUri,
        displayImageUri,
        timestamp,
        savedRecordId,
        isDateEditOpen,
        setIsDateEditOpen,
        handleDateUpdate,
        pins,
        layoutStyle,
        scrollY,
        scrollHandler,
        imageAnimatedStyle,
        headerOverlayStyle,
        isBreakdownOpen,
        setIsBreakdownOpen,
        isError,
        errorInfo,
    };
}
