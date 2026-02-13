import { mapAnalyzedData } from './mappers';
import { AnalyzedData, BarcodeLookupResult } from './types';
import {
    performMultipartAnalysisUpload,
    rethrowTimeoutAsColdStartMessage,
} from './internal/analyzeUpload';
import { lookupBarcodeWithAllergyContext } from './internal/barcodeLookup';

export const analyzeImage = async (
    imageUri: string,
    isoCountryCode: string = 'US',
    onProgress?: (progress: number) => void
): Promise<AnalyzedData> => {
    try {
        const data = await performMultipartAnalysisUpload({
            endpointPath: '/analyze',
            imageUri,
            isoCountryCode,
            onProgress,
        });
        return mapAnalyzedData(data);
    } catch (error: any) {
        rethrowTimeoutAsColdStartMessage(
            error,
            'Analysis timed out ({timeout}s). The server might be "Cold Starting" on Render free tier.',
        );
        throw error;
    }
};

export const analyzeLabel = async (
    imageUri: string,
    isoCountryCode: string = 'US',
    onProgress?: (progress: number) => void
): Promise<AnalyzedData> => {
    console.log('[AI] Starting label analysis...');

    try {
        const data = await performMultipartAnalysisUpload({
            endpointPath: '/analyze/label',
            imageUri,
            isoCountryCode,
            onProgress,
        });
        return mapAnalyzedData(data);
    } catch (error: any) {
        rethrowTimeoutAsColdStartMessage(
            error,
            'Label analysis timed out. The server might be "Cold Starting".',
        );
        throw error;
    }
};

export const analyzeSmart = async (
    imageUri: string,
    isoCountryCode: string = 'US',
    onProgress?: (progress: number) => void
): Promise<AnalyzedData> => {
    console.log('[AI] Starting smart analysis...');

    try {
        const data = await performMultipartAnalysisUpload({
            endpointPath: '/analyze/smart',
            imageUri,
            isoCountryCode,
            onProgress,
        });
        return mapAnalyzedData(data);
    } catch (error: any) {
        rethrowTimeoutAsColdStartMessage(
            error,
            'Smart analysis timed out. The server might be "Cold Starting".',
        );
        throw error;
    }
};

export const lookupBarcode = async (barcode: string): Promise<BarcodeLookupResult> => {
    try {
        return await lookupBarcodeWithAllergyContext(barcode);
    } catch (error: any) {
        console.error('[AI] Barcode Lookup Failed:', error);
        return { found: false, error: error.message };
    }
};
