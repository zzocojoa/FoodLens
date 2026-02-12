import * as FileSystem from 'expo-file-system/legacy';
import { ANALYSIS_TIMEOUT_MS } from './constants';
import { getAllergyString } from './allergy';
import { mapAnalyzedData, mapBarcodeToAnalyzedData } from './mappers';
import { ServerConfig } from './serverConfig';
import { uploadWithRetry } from './upload';
import { AnalyzedData, BarcodeLookupResult } from './types';

export const analyzeImage = async (
    imageUri: string,
    isoCountryCode: string = 'US',
    onProgress?: (progress: number) => void
): Promise<AnalyzedData> => {
    const activeServerUrl = await ServerConfig.getServerUrl();
    console.log('Uploading to Python Server:', activeServerUrl);

    const allergyString = await getAllergyString();
    console.log('Analyzing with allergies:', allergyString);

    try {
        const uploadResult = await uploadWithRetry(
            `${activeServerUrl}/analyze`,
            imageUri,
            {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'file',
                parameters: {
                    allergy_info: allergyString,
                    iso_country_code: isoCountryCode,
                },
            },
            3,
            onProgress
        );

        const data = JSON.parse(uploadResult.body);
        return mapAnalyzedData(data);
    } catch (error: any) {
        if (error.message?.includes('timed out')) {
            throw new Error(
                `Analysis timed out (${ANALYSIS_TIMEOUT_MS / 1000}s). The server might be "Cold Starting" on Render free tier.`
            );
        }
        throw error;
    }
};

export const analyzeLabel = async (
    imageUri: string,
    isoCountryCode: string = 'US',
    onProgress?: (progress: number) => void
): Promise<AnalyzedData> => {
    const activeServerUrl = await ServerConfig.getServerUrl();
    const allergyString = await getAllergyString();

    console.log('[AI] Starting label analysis...');

    try {
        const uploadResult = await uploadWithRetry(
            `${activeServerUrl}/analyze/label`,
            imageUri,
            {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'file',
                parameters: {
                    allergy_info: allergyString,
                    iso_country_code: isoCountryCode,
                },
            },
            3,
            onProgress
        );

        const data = JSON.parse(uploadResult.body);
        return mapAnalyzedData(data);
    } catch (error: any) {
        if (error.message?.includes('timed out')) {
            throw new Error('Label analysis timed out. The server might be "Cold Starting".');
        }
        throw error;
    }
};

export const analyzeSmart = async (
    imageUri: string,
    isoCountryCode: string = 'US',
    onProgress?: (progress: number) => void
): Promise<AnalyzedData> => {
    const activeServerUrl = await ServerConfig.getServerUrl();
    const allergyString = await getAllergyString();

    console.log('[AI] Starting smart analysis...');

    try {
        const uploadResult = await uploadWithRetry(
            `${activeServerUrl}/analyze/smart`,
            imageUri,
            {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'file',
                parameters: {
                    allergy_info: allergyString,
                    iso_country_code: isoCountryCode,
                },
            },
            3,
            onProgress
        );

        const data = JSON.parse(uploadResult.body);
        return mapAnalyzedData(data);
    } catch (error: any) {
        if (error.message?.includes('timed out')) {
            throw new Error('Smart analysis timed out. The server might be "Cold Starting".');
        }
        throw error;
    }
};

export const lookupBarcode = async (barcode: string): Promise<BarcodeLookupResult> => {
    const activeServerUrl = await ServerConfig.getServerUrl();

    try {
        const allergyString = await getAllergyString();
        console.log('[AI] Barcode lookup with allergies:', allergyString);

        const formData = new FormData();
        formData.append('barcode', barcode);
        formData.append('allergy_info', allergyString);

        const response = await fetch(`${activeServerUrl}/lookup/barcode`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const result = await response.json();

        if (result.found && result.data) {
            result.data = mapBarcodeToAnalyzedData(result.data);
        }

        return result;
    } catch (error: any) {
        console.error('[AI] Barcode Lookup Failed:', error);
        return { found: false, error: error.message };
    }
};
