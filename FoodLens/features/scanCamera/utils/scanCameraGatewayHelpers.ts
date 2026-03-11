import { Href } from 'expo-router';

import { AnalyzedData } from '../../../services/ai';
import {
    assertAnalysisImageFileReady,
    createAnalysisUploadProgressHandler,
} from '../../../services/analysis/flow';
import { saveImagePermanentlyOrThrow } from '../../../services/imageStorage';
import { dataStore } from '../../../services/dataStore';
import { normalizeTimestamp } from '../../../services/utils';
import { LocationData } from '../../../services/utils/types';
import { createFallbackLocation } from './scanCameraMappers';
import { buildResultRoute } from '@/services/contracts/resultRoute';

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
    sourceType,
    router,
}: {
    analysisResult: AnalyzedData;
    locationData: LocationData | null;
    isoCode: string;
    timestamp?: string | null;
    imageUri: string;
    fallbackAddress?: string;
    sourceType?: 'camera' | 'library';
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

    router.replace(buildResultRoute({ isNew: true, sourceType: sourceType || 'camera' }));
};

export const assertImageFileReady = assertAnalysisImageFileReady;
export const createProgressHandler = createAnalysisUploadProgressHandler;
