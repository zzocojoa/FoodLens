import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Dimensions } from 'react-native';
import { useAnalysisData } from '@/hooks/result/useAnalysisData';
import { useAutoSave } from '@/hooks/result/useAutoSave';
import { usePinLayout } from '@/hooks/result/usePinLayout';
import { useResultUI } from '@/hooks/result/useResultUI';
import { useI18n } from '@/features/i18n';
import { parseResultRouteFlags, type ResultSearchParams } from '@/services/contracts/resultRoute';
import { getResultErrorInfo, isResultError } from '../utils/resultError';
import { useDateUpdateAction, useNewResultHaptic, usePhotoLibraryAutoSave } from './useResultSideEffects';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function useResultScreen() {
    const params = useLocalSearchParams<ResultSearchParams>();
    const { t } = useI18n();
    const routeFlags = parseResultRouteFlags(params);

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

    const { pins, layoutStyle, imageSize } = usePinLayout(
        result?.ingredients, 
        displayImageUri, 
        !(result?.isBarcode || routeFlags.isBarcodeParam), // Hide pins if barcode
        imageDimensions
    );

    const adjustedLayoutStyle = React.useMemo(() => {
        if (!layoutStyle) return layoutStyle;

        const isCameraLandscapePhoto =
            routeFlags.sourceType === 'camera' &&
            !result?.isBarcode &&
            !routeFlags.isBarcodeParam &&
            !!imageSize &&
            imageSize.width > imageSize.height;

        if (!isCameraLandscapePhoto) return layoutStyle;

        const imageRatio = imageSize.width / imageSize.height;
        const computedHeight = SCREEN_WIDTH / (imageRatio) * 1.5;

        return {
            ...layoutStyle,
            height: computedHeight,
            width: layoutStyle.width,
            marginLeft: 0,
            marginTop: 55,
        };
    }, [imageSize, layoutStyle, result?.isBarcode, routeFlags.isBarcodeParam, routeFlags.sourceType]);

    const {
        scrollY,
        scrollHandler,
        imageAnimatedStyle,
        headerOverlayStyle,
        isBreakdownOpen,
        openBreakdown,
        closeBreakdown,
    } = useResultUI();

    useNewResultHaptic(!!result, routeFlags.isNew);
    usePhotoLibraryAutoSave({
        isNew: routeFlags.isNew,
        sourceType: routeFlags.sourceType,
        imageUri: displayImageUri,
        isBarcode: !!result?.isBarcode || routeFlags.isBarcodeParam,
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
        layoutStyle: adjustedLayoutStyle,
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
