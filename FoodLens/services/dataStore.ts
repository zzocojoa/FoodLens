import { AnalyzedData } from './ai';

class AnalysisDataStore {
  private static instance: AnalysisDataStore;
  private currentResult: AnalyzedData | null = null;
  private currentLocation: any | null = null;
  private currentImageUri: string | null = null;

  private constructor() {}

  public static getInstance(): AnalysisDataStore {
    if (!AnalysisDataStore.instance) {
      AnalysisDataStore.instance = new AnalysisDataStore();
    }
    return AnalysisDataStore.instance;
  }

  public setData(result: AnalyzedData, location: any, imageUri: string) {
    this.currentResult = result;
    this.currentLocation = location;
    this.currentImageUri = imageUri;
  }

  public getData() {
    return {
      result: this.currentResult,
      location: this.currentLocation,
      imageUri: this.currentImageUri
    };
  }

  public clear() {
    this.currentResult = null;
    this.currentLocation = null;
    this.currentImageUri = null;
  }
}

export const dataStore = AnalysisDataStore.getInstance();
