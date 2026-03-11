import { SafeStorage } from './storage';
import type {
  AnalysisStoreBackup,
  AnalysisStoreLocation,
  AnalysisStoreResult,
  AnalysisStoreSnapshot,
} from './contracts/analysisStore';

const DATA_STORE_BACKUP_KEY = 'foodlens_analysis_backup_v1';
const BACKUP_ERROR_LOG_PREFIX = '[AnalysisDataStore]';

const nowIso = (): string => new Date().toISOString();

class AnalysisDataStore {
  private static instance: AnalysisDataStore;
  private currentResult: AnalysisStoreResult | null = null;
  private currentLocation: AnalysisStoreLocation | null = null;
  private currentImageUri: string | null = null;
  private currentTimestamp: string | null = null;

  private constructor() {}

  public static getInstance(): AnalysisDataStore {
    if (!AnalysisDataStore.instance) {
      AnalysisDataStore.instance = new AnalysisDataStore();
    }
    return AnalysisDataStore.instance;
  }

  public setData(
    result: AnalysisStoreResult,
    location: AnalysisStoreLocation,
    imageUri: string,
    timestamp?: string
  ): void {
    this.currentResult = result;
    this.currentLocation = location;
    this.currentImageUri = imageUri;
    this.currentTimestamp = timestamp || nowIso();
    
    // Fire-and-forget backup
    this.saveBackup().catch((error) => console.warn(`${BACKUP_ERROR_LOG_PREFIX} Failed to backup analysis data`, error));
  }

  public getData(): AnalysisStoreSnapshot {
    return {
      result: this.currentResult,
      location: this.currentLocation,
      imageUri: this.currentImageUri,
      timestamp: this.currentTimestamp
    };
  }

  private buildBackupPayload(): AnalysisStoreBackup | null {
    if (!this.currentResult) return null;
    return {
      result: this.currentResult,
      location: this.currentLocation,
      imageUri: this.currentImageUri,
      timestamp: Date.now(),
      originalTimestamp: this.currentTimestamp,
    };
  }

  public async saveBackup(): Promise<void> {
      const backupPayload = this.buildBackupPayload();
      if (!backupPayload) return;
      await SafeStorage.set(DATA_STORE_BACKUP_KEY, backupPayload);
  }

  private applyBackup(backup: AnalysisStoreBackup): void {
      this.currentResult = backup.result;
      this.currentLocation = backup.location;
      this.currentImageUri = backup.imageUri;
      this.currentTimestamp = backup.originalTimestamp || nowIso();
  }

  public async restoreBackup(): Promise<boolean> {
      try {
          const backup = await SafeStorage.get<AnalysisStoreBackup | null>(DATA_STORE_BACKUP_KEY, null);
          if (backup && backup.result) {
              // Optional: Check timestamp validity (e.g. 1 hour expiry)
              // For now, infinite validity for crash recovery
              this.applyBackup(backup);
              return true;
          }
      } catch (error) {
          console.warn(`${BACKUP_ERROR_LOG_PREFIX} Failed to restore backup`, error);
      }
      return false;
  }

  public updateTimestamp(newTimestamp: string): void {
      this.currentTimestamp = newTimestamp;
      // Update backup asynchronously
      this.saveBackup().catch((error) =>
        console.warn(`${BACKUP_ERROR_LOG_PREFIX} Failed to update backup timestamp`, error)
      );
  }

  public async clear(): Promise<void> {
    this.currentResult = null;
    this.currentLocation = null;
    this.currentImageUri = null;
    this.currentTimestamp = null;
    await SafeStorage.remove(DATA_STORE_BACKUP_KEY);
  }
}

export const dataStore = AnalysisDataStore.getInstance();
