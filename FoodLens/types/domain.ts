/**
 * FoodLens Core Domain Types
 */

export interface NutritionalInfo {
  calories: number;
  carbohydrates: number;
  protein: number;
  fat: number;
  sugar?: number;
  sodium?: number;
  cholesterol?: number;
  saturatedFat?: number;
  transFat?: number;
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  servingSize: string;
  servingUnit: string;
  nutrition: NutritionalInfo;
  imageUri?: string;
  category?: string;
}

export interface AnalysisResult {
  timestamp: string;
  foodItems: FoodItem[];
  totalNutrition: NutritionalInfo;
  summary: string;
  warnings?: string[];
  imageUrl: string;
}

export type CameraMode = 'FOOD' | 'LABEL' | 'BARCODE';
