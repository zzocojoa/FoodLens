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
  confidence?: number; // 0-100 identification confidence percentage
  ingredients: {
    name: string;
    isAllergen: boolean;
    box_2d?: number[]; // [ymin, xmin, ymax, xmax] (0-1000)
  }[];
  nutrition?: NutritionData; // USDA FoodData Central nutrition info
  translationCard?: TranslationCard;
  raw_result?: string;
}

// Timeout helper function
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000} seconds`)), ms)
    )
  ]);
};

const ANALYSIS_TIMEOUT_MS = 20000; // 20 seconds

export const analyzeImage = async (imageUri: string, isoCountryCode: string = "US"): Promise<AnalyzedData> => {
  try {
    const activeServerUrl = await ServerConfig.getServerUrl();
    console.log('Uploading to Python Server:', activeServerUrl);
    
    // 1. Get User Profile for Allergies
    const TEST_UID = "test-user-v1"; // Match the ID used in profile.tsx
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

    // Wrap the upload call with a 20-second timeout
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

    console.log('Server Status:', uploadResult.status);
    console.log('Server Body:', uploadResult.body);

    if (uploadResult.status !== 200) {
      throw new Error(`Server Error: ${uploadResult.status}`);
    }

    const data = JSON.parse(uploadResult.body);
    
    // Normalize data structure if server returns something slightly different
    return {
        foodName: data.foodName || "Analyzed Food",
        safetyStatus: data.safetyStatus || "CAUTION",
        confidence: typeof data.confidence === 'number' ? Math.max(0, Math.min(100, data.confidence)) : undefined,
        ingredients: data.ingredients || [],
        nutrition: data.nutrition || undefined,
        translationCard: data.translationCard,
        raw_result: data.raw_result
    };

  } catch (error) {
    console.error('Error connecting to Python Server:', error);
    return {
      foodName: "Server Error",
      safetyStatus: "DANGER",
      confidence: 0,
      ingredients: [{ name: "Check server connection", isAllergen: false }]
    };
  }
};
