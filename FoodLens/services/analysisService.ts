import { AnalyzedData } from './ai';
import { deleteImage } from './imageStorage_Logic';
import { generateId, resolveRecordTimestamp } from './analysis/helpers_Logic';
import { getStoredAnalyses, saveAnalyses } from './analysis/storage_Logic';
import { AnalysisRecord } from './analysis/types_Logic';
import { logger } from './logger_Logic';
import { SafeStorage } from './storage_Logic';
import { Phase2Api, Phase2SyncApiError } from './sync/phase2Api_Logic';
import { mergeRemoteHistory, serializeHistoryRecord } from './sync/phase2Mappers_Logic';
import { dispatchPhase2SyncQueue, enqueueHistorySync, startPhase2SyncRuntime } from './sync/phase2SyncQueue_Logic';

export type { AnalysisRecord } from './analysis/types_Structure';

const HISTORY_MIGRATION_MARKER_PREFIX = '@foodlens_phase2_history_migrated:';
const HISTORY_DELETE_TOMBSTONE_PREFIX = '@foodlens_phase2_history_deleted_ids:';
const HISTORY_SERVER_PULL_COOLDOWN_MS = 15_000;

const historyServerPullInFlight = new Map<string, Promise<AnalysisRecord[] | null>>();
const historyServerPullLastAt = new Map<string, number>();

const historyMigrationMarkerKey = (userId: string): string => `${HISTORY_MIGRATION_MARKER_PREFIX}${userId}`;
const historyDeleteTombstoneKey = (userId: string): string => `${HISTORY_DELETE_TOMBSTONE_PREFIX}${userId}`;

const getHistoryDeleteSet = async (userId: string): Promise<Set<string>> => {
  const list = await SafeStorage.get<string[]>(historyDeleteTombstoneKey(userId), []);
  return new Set(list);
};

const saveHistoryDeleteSet = async (userId: string, deleteSet: Set<string>): Promise<void> => {
  await SafeStorage.set(historyDeleteTombstoneKey(userId), [...deleteSet]);
};

const syncHistoryFromServer = async (
  userId: string,
  local: AnalysisRecord[],
  options: { force?: boolean } = {}
): Promise<AnalysisRecord[] | null> => {
  const force = options.force === true;
  const activePull = historyServerPullInFlight.get(userId);
  if (activePull) {
    return activePull;
  }

  const lastPulledAt = historyServerPullLastAt.get(userId);
  if (!force && typeof lastPulledAt === 'number' && Date.now() - lastPulledAt < HISTORY_SERVER_PULL_COOLDOWN_MS) {
    return null;
  }
  historyServerPullLastAt.set(userId, Date.now());

  const pullPromise = (async (): Promise<AnalysisRecord[] | null> => {
    try {
      const deleteSet = await getHistoryDeleteSet(userId);
      const remote = await Phase2Api.getHistory();
      const filteredRemote = remote.history.filter((item) => {
        const remoteEntryId =
          typeof item.entry?.['id'] === 'string' ? item.entry['id'] : item.id;
        return !deleteSet.has(remoteEntryId);
      });
      const merged = mergeRemoteHistory(local, filteredRemote);
      await saveAnalyses(userId, merged);
      return merged;
    } catch (error) {
      const apiError = error instanceof Phase2SyncApiError ? error : null;
      if (apiError?.code === 'AUTH_SESSION_REQUIRED') {
        return null;
      }
      logger.warn('[Phase2Sync] history pull failed', {
        request_id: apiError?.requestId || 'unknown',
        user_id: userId,
        code: apiError?.code || 'PHASE2_HISTORY_PULL_FAILED',
      });
      return null;
    } finally {
      historyServerPullInFlight.delete(userId);
    }
  })();
  historyServerPullInFlight.set(userId, pullPromise);
  return pullPromise;
};

const enqueueHistoryMigrationIfNeeded = async (userId: string, records: AnalysisRecord[]): Promise<void> => {
  const migrated = await SafeStorage.get<boolean>(historyMigrationMarkerKey(userId), false);
  if (migrated) return;
  if (records.length === 0) {
    await SafeStorage.set(historyMigrationMarkerKey(userId), true);
    return;
  }
  for (const item of records) {
    await enqueueHistorySync(userId, serializeHistoryRecord(item), item.id);
  }
  await SafeStorage.set(historyMigrationMarkerKey(userId), true);
};

const flushHistoryWrites = async (userId: string): Promise<void> => {
  try {
    await dispatchPhase2SyncQueue();
  } catch (error) {
    logger.warn('[Phase2Sync] history write flush failed', {
      request_id: 'unknown',
      user_id: userId,
      code: error instanceof Error ? error.message : 'PHASE2_HISTORY_FLUSH_FAILED',
    });
  }
};

const deleteHistoryItemsFromServer = async (
  userId: string,
  analysisIds: string[]
): Promise<void> => {
  if (analysisIds.length === 0) return;
  try {
    startPhase2SyncRuntime();
    const results = await Promise.allSettled(
      analysisIds.map((analysisId) => Phase2Api.deleteHistory(analysisId))
    );
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length === 0) return;

    const authRequiredOnly = failed.every((result) => {
      const reason = (result as PromiseRejectedResult).reason;
      return reason instanceof Phase2SyncApiError && reason.code === 'AUTH_SESSION_REQUIRED';
    });
    if (authRequiredOnly) return;

    logger.warn('[Phase2Sync] history delete remote sync failed', {
      request_id: 'unknown',
      user_id: userId,
      code: 'PHASE2_HISTORY_DELETE_SYNC_FAILED',
      failed_count: failed.length,
    });
  } catch (error) {
    logger.warn('[Phase2Sync] history delete remote sync failed', {
      request_id: 'unknown',
      user_id: userId,
      code: error instanceof Error ? error.message : 'PHASE2_HISTORY_DELETE_SYNC_FAILED',
    });
  }
};

export const AnalysisService = {
    /**
     * Save a new analysis result to local storage
     */
    saveAnalysis: async (userId: string, data: AnalyzedData, imageUri?: string, location?: AnalysisRecord['location'], originalTimestamp?: string) => {
        try {
            startPhase2SyncRuntime();
            const analyses = await getStoredAnalyses(userId);
            const finalDate = resolveRecordTimestamp(originalTimestamp);

            const newRecord: AnalysisRecord = {
                ...data,
                id: generateId(),
                timestamp: finalDate, // Use the parsed original date
                imageUri: imageUri || undefined,
                location: location || undefined,
            };

            // Add to beginning (newest first)
            analyses.unshift(newRecord);
            
            // Re-sort: Since we are now inserting potentially old dates, 
            // we should sort the array to keep history chronological?
            // Usually history is "Recently Analyzed", but if I upload an old photo, 
            // should it appear at the top (as recent action) or down below (chronological)?
            // User request: "save original date". 
            // Standard behavior for "History" in this context is usually "Action History" (what I did recently).
            // But if we want to organize by "Trip Date", we might need sorting.
            // For now, let's keep it unshift (Action History) but display the correct date.
            // If the user wants a timeline view later, we can sort.
            
            await saveAnalyses(userId, analyses);
            const deleteSet = await getHistoryDeleteSet(userId);
            if (deleteSet.has(newRecord.id)) {
              deleteSet.delete(newRecord.id);
              await saveHistoryDeleteSet(userId, deleteSet);
            }
            await enqueueHistorySync(userId, serializeHistoryRecord(newRecord), newRecord.id);
            await flushHistoryWrites(userId);
            logger.info('Analysis saved successfully with date', finalDate.toISOString(), 'AnalysisService');
            return newRecord;
        } catch (error) {
            logger.error('Error saving analysis', error, 'AnalysisService');
            throw error;
        }
    },

    /**
     * Get recent analyses for the Home screen
     */
    getRecentAnalyses: async (userId: string, limitCount: number = 2): Promise<AnalysisRecord[]> => {
        try {
            const analyses = await AnalysisService.getAllAnalyses(userId);
            return analyses.slice(0, limitCount);
        } catch (error) {
            logger.error('Error fetching recent analyses', error, 'AnalysisService');
            return [];
        }
    },

    /**
     * Get all analyses for the History screen
     */
    getAllAnalyses: async (userId: string): Promise<AnalysisRecord[]> => {
        try {
            startPhase2SyncRuntime();
            const local = await getStoredAnalyses(userId);
            await enqueueHistoryMigrationIfNeeded(userId, local);
            await dispatchPhase2SyncQueue();

            if (local.length === 0) {
              const remote = await syncHistoryFromServer(userId, local, { force: true });
              if (Array.isArray(remote)) return remote;
            } else {
              void syncHistoryFromServer(userId, local, { force: false });
            }
            return local;
        } catch (error) {
            logger.error('Error fetching all analyses', error, 'AnalysisService');
            return [];
        }
    },

    /**
     * Delete a single analysis record
     */
    deleteAnalysis: async (userId: string, analysisId: string) => {
        return AnalysisService.deleteAnalyses(userId, [analysisId]);
    },

    /**
     * Delete multiple analysis records (Batch Operation)
     * Prevents race conditions when deleting multiple items in parallel
     */
    deleteAnalyses: async (userId: string, analysisIds: string[]) => {
        try {
            const analyses = await getStoredAnalyses(userId);
            const idsToDelete = new Set(analysisIds);
            const filtered = analyses.filter(a => !idsToDelete.has(a.id));
            
            // Clean up associated image files
            const deleted = analyses.filter(a => idsToDelete.has(a.id));
            for (const record of deleted) {
                await deleteImage(record.imageUri).catch(() => {});
            }
            
            if (filtered.length !== analyses.length) {
                await saveAnalyses(userId, filtered);
                const deleteSet = await getHistoryDeleteSet(userId);
                analysisIds.forEach((id) => deleteSet.add(id));
                await saveHistoryDeleteSet(userId, deleteSet);
                await deleteHistoryItemsFromServer(userId, deleted.map((item) => item.id));
                logger.info(
                  `[DELETE] Batch Success: ${analysisIds.length} items requested, ${analyses.length - filtered.length} deleted`,
                  undefined,
                  'AnalysisService'
                );
            }
        } catch (error) {
            logger.error('Error deleting analyses', error, 'AnalysisService');
            throw error;
        }
    },

    /**
     * Update the timestamp of a specific analysis record
     */
    updateAnalysisTimestamp: async (userId: string, analysisId: string, newTimestamp: Date) => {
        try {
            const analyses = await getStoredAnalyses(userId);
            const index = analyses.findIndex(a => a.id === analysisId);
            
            if (index !== -1) {
                analyses[index].timestamp = newTimestamp;
                // Optional: Re-sort if strictly chronological
                await saveAnalyses(userId, analyses);
                logger.info(
                  `[UPDATE] Updated timestamp for ${analysisId} to ${newTimestamp.toISOString()}`,
                  undefined,
                  'AnalysisService'
                );
                return true;
            }
            return false;
        } catch (error) {
            logger.error('Error updating analysis timestamp', error, 'AnalysisService');
            return false;
        }
    }
};
