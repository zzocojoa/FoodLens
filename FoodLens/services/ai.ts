import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { UserService } from './userService';

// Default fallback URL
const DEFAULT_SERVER_URL = 'https://foodlens-2-w1xu.onrender.com';
const STORAGE_KEY = 'foodlens_custom_server_url';

export const ServerConfig = {
    /**
     * Get the currently configured server URL
     */
    getServerUrl: async (): Promise<string> => {
        try {
            const savedUrl = await AsyncStorage.getItem(STORAGE_KEY);
            return savedUrl || DEFAULT_SERVER_URL;
        } catch (e) {
            return DEFAULT_SERVER_URL;
        }
    },

    /**
     * Save a new server URL
     */
    setServerUrl: async (url: string): Promise<void> => {
        try {
            if (!url) {
                await AsyncStorage.removeItem(STORAGE_KEY);
            } else {
                // Ensure no trailing slash
                const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                await AsyncStorage.setItem(STORAGE_KEY, cleanUrl);
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

const ANALYSIS_TIMEOUT_MS = 120000; // 120 seconds

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

export const analyzeImage = async (imageUri: string, isoCountryCode: string = "US"): Promise<AnalyzedData> => {
  try {
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
        const uploadResult = await withTimeout(
            FileSystem.uploadAsync(`${activeServerUrl}/analyze`, imageUri, {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'file',
                parameters: {
                    'allergy_info': allergyString,
                    'iso_country_code': isoCountryCode
                }
            }),
            ANALYSIS_TIMEOUT_MS
        );

        if (uploadResult.status !== 200) {
            throw new Error(`Server error (${uploadResult.status}): ${uploadResult.body}`);
        }

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
            throw new Error('Analysis timed out (60s). The server might be responding slowly.');
        }
        throw error;
    }
  } catch (error: any) {
    console.error("Error connecting to Python Server:", error);
    return {
        foodName: "Analysis Failed",
        safetyStatus: "CAUTION",
        confidence: 0,
        ingredients: [{ name: "Please try again later", isAllergen: false }],
        raw_result: `Error: ${error.message || 'Unknown server error'}`
    };
  }
};
