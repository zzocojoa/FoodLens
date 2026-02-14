import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAnalysisData } from '@/hooks/result/useAnalysisData';
import { useAutoSave } from '@/hooks/result/useAutoSave';
import { usePinLayout } from '@/hooks/result/usePinLayout';
import { useResultUI } from '@/hooks/result/useResultUI';
import { useI18n } from '@/features/i18n';
import { getResultErrorInfo, isResultError } from '../utils/resultError';
import { useDateUpdateAction, useNewResultHaptic, usePhotoLibraryAutoSave } from './useResultSideEffects';

export function useResultScreen() {
    const params = useLocalSearchParams();
    const { t } = useI18n();

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

    const handleDateUpdate = useDateUpdateAction(savedRecordId, updateTimestamp, () => {
        setIsDateEditOpen(false);
    });

    const { pins, layoutStyle } = usePinLayout(
        result?.ingredients, 
        displayImageUri, 
        !(result?.isBarcode || params['isBarcode'] === 'true'), // Hide pins if barcode
        imageDimensions
    );

    const {
        scrollY,
        scrollHandler,
        imageAnimatedStyle,
        headerOverlayStyle,
        isBreakdownOpen,
        openBreakdown,
        closeBreakdown,
    } = useResultUI();

    useNewResultHaptic(!!result);
    usePhotoLibraryAutoSave({
        isNew: params['isNew'],
        imageUri: displayImageUri,
        isBarcode: !!result?.isBarcode || params['isBarcode'] === 'true',
        locationData,
        t,
    });

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
        openBreakdown,
        closeBreakdown,
        isError,
        errorInfo,
    };
}
