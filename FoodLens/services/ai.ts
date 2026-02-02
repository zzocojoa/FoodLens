import * as FileSystem from 'expo-file-system/legacy';
import { SafeStorage } from './storage'; // Replaced AsyncStorage

import { UserService } from './userService';

// Default fallback URL
const DEFAULT_SERVER_URL = 'https://foodlens-2-w1xu.onrender.com';
const STORAGE_KEY = 'foodlens_custom_server_url';

export const ServerConfig = {
    /**
     * Get the currently configured server URL
     * Note: Always using cloud server for now
     */
    getServerUrl: async (): Promise<string> => {
        // Use SafeStorage to retrieve cached URL or fallback
        // Current logic overrides this, but for robustness we implement safe fetching
        return DEFAULT_SERVER_URL;
        // If we wanted to use stored URL:
        // const stored = await SafeStorage.get<string>(STORAGE_KEY, DEFAULT_SERVER_URL);
        // return stored;
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
    box_2d?: number[];
  }[];
  nutrition?: NutritionData;
  translationCard?: TranslationCard;
  raw_result?: string;
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
const uploadWithRetry = async (url: string, imageUri: string, options: any, maxRetries = 3): Promise<FileSystem.FileSystemUploadResult> => {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Upload attempt ${attempt}/${maxRetries}`);
            const result = await withTimeout(
                FileSystem.uploadAsync(url, imageUri, options),
                ANALYSIS_TIMEOUT_MS
            );
            
            if (result.status === 200) {
                return result;
            }
            
            // If server returns non-200, throw to trigger retry
            // NOTE: 4xx errors (client error) usually shouldn't be retried, but for robustness we treat them as retryable for now unless 400/401
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

export const analyzeImage = async (imageUri: string, isoCountryCode: string = "US"): Promise<AnalyzedData> => {
    // Note: We intentionally allow errors to propagate so the UI can handle them (Retry/Alert)
    const activeServerUrl = await ServerConfig.getServerUrl();
    console.log('Uploading to Python Server:', activeServerUrl);
    
    // 1. Get User Profile for Allergies
    const TEST_UID = "test-user-v1";
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
            3 // Max retries
        );

        const data = JSON.parse(uploadResult.body);
        
        return {
            foodName: data.foodName || "Analyzed Food",
            safetyStatus: data.safetyStatus || "CAUTION",
            confidence: typeof data.confidence === 'number' ? Math.max(0, Math.min(100, data.confidence)) : undefined,
            ingredients: data.ingredients || [],
            nutrition: data.nutrition || undefined,
            translationCard: data.translationCard,
            raw_result: data.raw_result
        };
    } catch (error: any) {
        if (error.message?.includes('timed out')) {
            throw new Error(`Analysis timed out (${ANALYSIS_TIMEOUT_MS / 1000}s). The server might be "Cold Starting" on Render free tier.`);
        }
        throw error;
    }
};
