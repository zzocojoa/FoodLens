import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Dimensions } from 'react-native';
import { useAnalysisData } from '@/hooks/result/useAnalysisData';
import { useAutoSave } from '@/hooks/result/useAutoSave';
import { useImageSize } from '@/hooks/result/useImageSize';
import { useResultUI } from '@/hooks/result/useResultUI';
import { useI18n } from '@/features/i18n';
import { parseResultRouteFlags, type ResultSearchParams } from '@/services/contracts/resultRoute';
import { getResultErrorInfo, isResultError } from '../utils/resultError';
import { useDateUpdateAction, useNewResultHaptic, usePhotoLibraryAutoSave } from './useResultSideEffects';
import { HEADER_HEIGHT } from '../constants/result.constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_OVERLAY_OFFSET = 160;

const computeResultImageLayoutStyle = (
    imageSize: { width: number; height: number } | null,
    containerWidth: number,
    containerHeight: number
) => {
    if (!imageSize || imageSize.width <= 0 || imageSize.height <= 0) return undefined;

    const imageRatio = imageSize.width / imageSize.height;
    const containerRatio = containerWidth / containerHeight;

    if (imageRatio > containerRatio) {
        const renderedHeight = containerWidth / imageRatio;
        return {
            width: '100%' as const,
            height: renderedHeight,
            marginTop: 0,
            marginLeft: 0,
        };
    }

    const renderedWidth = Math.min(containerWidth, containerHeight * imageRatio);
    return {
        width: renderedWidth,
        height: containerHeight,
        marginTop: 0,
        marginLeft: (containerWidth - renderedWidth) / 2,
    };
};

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

    const imageSize = useImageSize(displayImageUri, imageDimensions, true);
    const baseLayoutStyle = React.useMemo(() => {
        const effectiveHeight =
            result?.isBarcode || routeFlags.isBarcodeParam
                ? HEADER_HEIGHT - CONTENT_OVERLAY_OFFSET
                : HEADER_HEIGHT;
        return computeResultImageLayoutStyle(imageSize, SCREEN_WIDTH, effectiveHeight);
    }, [imageSize, result?.isBarcode, routeFlags.isBarcodeParam]);

    const adjustedLayoutStyle = React.useMemo(() => {
        if (!baseLayoutStyle) return baseLayoutStyle;

        const isCameraLandscapePhoto =
            routeFlags.sourceType === 'camera' &&
            !result?.isBarcode &&
            !routeFlags.isBarcodeParam &&
            !!imageSize &&
            imageSize.width > imageSize.height;

        if (!isCameraLandscapePhoto) return baseLayoutStyle;

        const imageRatio = imageSize.width / imageSize.height;
        const computedHeight = SCREEN_WIDTH / (imageRatio) * 1.5;

        return {
            ...baseLayoutStyle,
            height: computedHeight,
            width: baseLayoutStyle.width,
            marginLeft: 0,
            marginTop: 55,
        };
    }, [baseLayoutStyle, imageSize, result?.isBarcode, routeFlags.isBarcodeParam, routeFlags.sourceType]);

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
        layoutStyle: adjustedLayoutStyle,
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
