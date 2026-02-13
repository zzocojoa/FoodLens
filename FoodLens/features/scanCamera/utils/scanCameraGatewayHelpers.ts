import * as FileSystem from 'expo-file-system/legacy';

import { saveImagePermanently } from '../../../services/imageStorage';
import { dataStore } from '../../../services/dataStore';
import { normalizeTimestamp } from '../../../services/utils';
import { createFallbackLocation } from './scanCameraMappers';

type LocationLike = {
    isoCountryCode?: string;
} | null;

type BeginParams = {
    uri: string;
    setIsAnalyzing: (value: boolean) => void;
    setCapturedImage: (value: string) => void;
    setActiveStep: (value: number) => void;
};

export const beginAnalysis = ({ uri, setIsAnalyzing, setCapturedImage, setActiveStep }: BeginParams) => {
    setIsAnalyzing(true);
    setCapturedImage(uri);
    setActiveStep(0);
};

export const assertImageFileReady = async (uri: string) => {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || (fileInfo as any).size === 0) {
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
    analysisResult: any;
    locationData: any;
    isoCode: string;
    timestamp?: string | null;
    imageUri: string;
    fallbackAddress?: string;
    router: { replace: (route: any) => void };
}) => {
    const locationContext =
        locationData || createFallbackLocation(0, 0, isoCode, fallbackAddress ?? 'Location Unavailable');
    const finalTimestamp = normalizeTimestamp(timestamp);
    const savedFilename = await saveImagePermanently(imageUri);

    dataStore.setData(analysisResult, locationContext, savedFilename || imageUri, finalTimestamp);

    router.replace({
        pathname: '/result',
        params: { fromStore: 'true', isNew: 'true' },
    });
};

