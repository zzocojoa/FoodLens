import { AnalyzedData } from './ai';
import { SafeStorage } from './storage';

const DATA_STORE_BACKUP_KEY = 'foodlens_analysis_backup_v1';

class AnalysisDataStore {
  private static instance: AnalysisDataStore;
  private currentResult: AnalyzedData | null = null;
  private currentLocation: any | null = null;
  private currentImageUri: string | null = null;
  private currentTimestamp: string | null = null;

  private constructor() {}

  public static getInstance(): AnalysisDataStore {
    if (!AnalysisDataStore.instance) {
      AnalysisDataStore.instance = new AnalysisDataStore();
    }
    return AnalysisDataStore.instance;
  }

  public setData(result: AnalyzedData, location: any, imageUri: string, timestamp?: string) {
    this.currentResult = result;
    this.currentLocation = location;
    this.currentImageUri = imageUri;
    this.currentTimestamp = timestamp || new Date().toISOString();
    
    // Fire-and-forget backup
    this.saveBackup().catch(e => console.warn("Failed to backup analysis data", e));
  }

  public getData() {
    return {
      result: this.currentResult,
      location: this.currentLocation,
      imageUri: this.currentImageUri,
      timestamp: this.currentTimestamp
    };
  }

  public async saveBackup() {
      if (!this.currentResult) return;
      await SafeStorage.set(DATA_STORE_BACKUP_KEY, {
          result: this.currentResult,
          location: this.currentLocation,
          imageUri: this.currentImageUri,
          timestamp: Date.now(), // Backup timestamp
          originalTimestamp: this.currentTimestamp // Photo timestamp
      });
  }

  public async restoreBackup(): Promise<boolean> {
      try {
          const backup = await SafeStorage.get<any>(DATA_STORE_BACKUP_KEY, null);
          if (backup && backup.result) {
              // Optional: Check timestamp validity (e.g. 1 hour expiry)
              // For now, infinite validity for crash recovery
              this.currentResult = backup.result;
              this.currentLocation = backup.location;
              this.currentImageUri = backup.imageUri;
              this.currentTimestamp = backup.originalTimestamp || new Date().toISOString();
              return true;
          }
      } catch (e) {
          console.warn("Failed to restore backup", e);
      }
      return false;
  }

  public updateTimestamp(newTimestamp: string) {
      this.currentTimestamp = newTimestamp;
      // Update backup asynchronously
      this.saveBackup().catch(e => console.warn("Failed to update backup timestamp", e));
  }

  public async clear() {
    this.currentResult = null;
    this.currentLocation = null;
    this.currentImageUri = null;
    this.currentTimestamp = null;
    await SafeStorage.remove(DATA_STORE_BACKUP_KEY);
  }
}

export const dataStore = AnalysisDataStore.getInstance();
