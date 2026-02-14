import * as FileSystem from 'expo-file-system/legacy';
import { Href } from 'expo-router';

import { AnalyzedData } from '../../../services/ai';
import { saveImagePermanentlyOrThrow } from '../../../services/imageStorage';
import { dataStore } from '../../../services/dataStore';
import { normalizeTimestamp } from '../../../services/utils';
import { LocationData } from '../../../services/utils/types';
import { createFallbackLocation } from './scanCameraMappers';
import { buildResultRoute } from '@/features/result/services/resultNavigationService';

type LocationLike = {
    isoCountryCode?: string;
} | null;

type RouterLike = {
    replace: (route: Href) => void;
};

type BeginParams = {
    uri: string;
    setIsAnalyzing: (value: boolean) => void;
    setCapturedImage: (value: string) => void;
    setActiveStep: (value: number | undefined) => void;
};

export const beginAnalysis = ({ uri, setIsAnalyzing, setCapturedImage, setActiveStep }: BeginParams) => {
    setIsAnalyzing(true);
    setCapturedImage(uri);
    setActiveStep(0);
};

export const assertImageFileReady = async (uri: string) => {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const fileSize = 'size' in fileInfo ? fileInfo.size : undefined;
    if (!fileInfo.exists || fileSize === 0) {
        throw new Error('File validation failed: Image is empty or missing.');
    }
};

export const createProgressHandler = ({
    isCancelled,
    setUploadProgress,
    setActiveStep,
}: {
    isCancelled: { current: boolean };
    setUploadProgress: (value: number) => void;
    setActiveStep: (value: number) => void;
}) => {
    return (progress: number) => {
        if (isCancelled.current) return;
        setUploadProgress(progress);
        if (progress >= 1) setActiveStep(2);
    };
};

export const getIsoCode = (locationData: LocationLike, fallback: string = 'US') => {
    return locationData?.isoCountryCode || fallback;
};

export const persistAndNavigateAnalysisResult = async ({
    analysisResult,
    locationData,
    isoCode,
    timestamp,
    imageUri,
    fallbackAddress,
    router,
}: {
    analysisResult: AnalyzedData;
    locationData: LocationData | null;
    isoCode: string;
    timestamp?: string | null;
    imageUri: string;
    fallbackAddress?: string;
    router: RouterLike;
}) => {
    const locationContext =
        locationData || createFallbackLocation(0, 0, isoCode, fallbackAddress ?? 'Location Unavailable');
    const finalTimestamp = normalizeTimestamp(timestamp);
    const savedFilename = await saveImagePermanentlyOrThrow(
        imageUri,
        'STORAGE_ERROR: Failed to save image permanently. Check disk space.'
    );

    dataStore.setData(analysisResult, locationContext, savedFilename, finalTimestamp);

    router.replace(buildResultRoute({ isNew: true }));
};
