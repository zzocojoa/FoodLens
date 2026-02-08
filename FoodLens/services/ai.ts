import * as FileSystem from 'expo-file-system/legacy';
import { SafeStorage } from './storage'; // Replaced AsyncStorage

import { UserService } from './userService';

// Default fallback URL
const DEFAULT_SERVER_URL = 'https://foodlens-2-w1xu.onrender.com';
const STORAGE_KEY = 'foodlens_custom_server_url';
const TEST_UID = "test-user-v1";

const clampConfidence = (confidence: unknown) =>
    typeof confidence === 'number' ? Math.max(0, Math.min(100, confidence)) : undefined;

const mapAnalyzedData = (data: any): AnalyzedData => ({
    foodName: data.foodName || "Analyzed Food",
    safetyStatus: data.safetyStatus || "CAUTION",
    confidence: clampConfidence(data.confidence),
    ingredients: data.ingredients || [],
    nutrition: data.nutrition || undefined,
    translationCard: data.translationCard,
    raw_result: data.raw_result
});

const getAllergyString = async (): Promise<string> => {
    let allergyString = "None";

    try {
        const user = await UserService.getUserProfile(TEST_UID);
        if (user) {
            const items = [...user.safetyProfile.allergies, ...user.safetyProfile.dietaryRestrictions];
            if (items.length > 0) {
                allergyString = items.join(", ");
            }
        }
    } catch (e) {
        console.warn("Could not load user profile for analysis:", e);
    }

    return allergyString;
};

export const ServerConfig = {
    /**
     * Get the currently configured server URL
     * Note: Always using cloud server for now
     */
    getServerUrl: async (): Promise<string> => {
        // Prioritize Environment Variable, then stored value (legacy support), then hardcoded fallback
        const envUrl = process.env.EXPO_PUBLIC_ANALYSIS_SERVER_URL;
        if (envUrl) return envUrl;

        // Fallback to legacy stored URL if env is missing
        const stored = await SafeStorage.get<string>(STORAGE_KEY, DEFAULT_SERVER_URL);
        return stored;
    },

    /**
     * Save a new server URL
     */
    setServerUrl: async (url: string): Promise<void> => {
        try {
            if (!url) {
                await SafeStorage.remove(STORAGE_KEY);
            } else {
                // Ensure no trailing slash
                const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                await SafeStorage.set(STORAGE_KEY, cleanUrl);
            }
        } catch (e) {
            console.error("Failed to save server URL", e);
        }
    }
};

export interface NutritionData {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  sugar: number | null;
  servingSize: string;
  dataSource: string;
  description?: string;
  fdcId?: number;
}

export interface TranslationCard {
  language: string;
  text: string | null;
  audio_query?: string;
}

export interface AnalyzedData {
  foodName: string;
  safetyStatus: 'SAFE' | 'CAUTION' | 'DANGER';
  confidence?: number;
  ingredients: {
    name: string;
    isAllergen: boolean;
    confidence_score?: number;
    box_2d?: number[];
    bbox?: number[];
    nutrition?: NutritionData;
  }[];
  nutrition?: NutritionData;
  translationCard?: TranslationCard;
  raw_result?: string;
  used_model?: string;
}

const ANALYSIS_TIMEOUT_MS = 180000; // 180 seconds (to account for Render cold starts)

// Helper function to add a timeout to a promise
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timeoutId: any;
    const timeout = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Operation timed out after ${ms} ms`));
        }, ms);
    });

    return Promise.race([promise, timeout]).finally(() => {
        clearTimeout(timeoutId);
    });
}

// Helper for delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to upload with retry
const uploadWithRetry = async (
    url: string, 
    imageUri: string, 
    options: any, 
    maxRetries = 3,
    onProgress?: (progress: number) => void
): Promise<FileSystem.FileSystemUploadResult> => {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Upload attempt ${attempt}/${maxRetries}`);
            
            const task = FileSystem.createUploadTask(
                url,
                imageUri,
                options,
                (data) => {
                    const progress = data.totalBytesExpectedToSend > 0 
                        ? data.totalBytesSent / data.totalBytesExpectedToSend
                        : 0;
                    if (onProgress) onProgress(progress);
                }
            );

            // Note: withTimeout might be tricky with createUploadTask cancellation, 
            // but for now we wrap the promise same as before.
            const result = await withTimeout(
                task.uploadAsync(),
                ANALYSIS_TIMEOUT_MS
            );
            
            // Type guard to ensure result is not undefined (uploadAsync returns UploadResult | undefined in some types, but here likely UploadResult)
            if (!result) throw new Error("Upload failed: No result");

            if (result.status === 200) {
                return result;
            }
            
            // If server returns non-200, throw to trigger retry
            if (result.status >= 400 && result.status < 500 && result.status !== 429) {
                 // Don't retry client errors except rate limit
                 throw new Error(`Server rejected request (${result.status}): ${result.body}`); 
            }
            
            throw new Error(`Server returned status ${result.status}`);
        } catch (error: any) {
            console.warn(`Attempt ${attempt} failed:`, error.message);
            lastError = error;
            
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
                console.log(`Waiting ${delay}ms before next retry...`);
                await sleep(delay);
            }
        }
    }
    
    throw lastError;
};

export const analyzeImage = async (
    imageUri: string, 
    isoCountryCode: string = "US",
    onProgress?: (progress: number) => void
): Promise<AnalyzedData> => {
    // Note: We intentionally allow errors to propagate so the UI can handle them (Retry/Alert)
    const activeServerUrl = await ServerConfig.getServerUrl();
    console.log('Uploading to Python Server:', activeServerUrl);
    
    // 1. Get User Profile for Allergies
    const allergyString = await getAllergyString();
    
    console.log("Analyzing with allergies:", allergyString);

    try {
        const uploadResult = await uploadWithRetry(
            `${activeServerUrl}/analyze`, 
            imageUri, 
            {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'file',
                parameters: {
                    'allergy_info': allergyString,
                    'iso_country_code': isoCountryCode
                }
            },
            3, // Max retries
            onProgress
        );

        const data = JSON.parse(uploadResult.body);
        return mapAnalyzedData(data);
    } catch (error: any) {
        if (error.message?.includes('timed out')) {
            throw new Error(`Analysis timed out (${ANALYSIS_TIMEOUT_MS / 1000}s). The server might be "Cold Starting" on Render free tier.`);
        }
        throw error;
    }
};
