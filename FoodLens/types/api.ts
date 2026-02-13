/**
 * FoodLens API Types
 */

import { AnalysisResult } from './domain';

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  success: boolean;
}

export type AnalysisApiResponse = ApiResponse<AnalysisResult>;

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}
