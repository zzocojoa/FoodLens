import { AnalyzedData } from './ai';
import { deleteImage } from './imageStorage';
import { generateId, resolveRecordTimestamp } from './analysis/helpers';
import { getStoredAnalyses, saveAnalyses } from './analysis/storage';
import { AnalysisRecord } from './analysis/types';
import { logger } from './logger';
import { SafeStorage } from './storage';
import { Phase2Api, Phase2SyncApiError } from './sync/phase2Api';
import { mergeRemoteHistory, serializeHistoryRecord } from './sync/phase2Mappers';
import {
  dispatchPhase2SyncQueue,
  enqueueHistorySync,
  enqueueHistoryTimestampPatch,
  getPhase2SyncQueueSnapshot,
  startPhase2SyncRuntime,
} from './sync/phase2SyncQueue';
import { queryClient } from './queryClient';

export type { AnalysisRecord } from './analysis/types';

const HISTORY_MIGRATION_MARKER_PREFIX = '@foodlens_phase2_history_migrated:';
const HISTORY_DELETE_TOMBSTONE_PREFIX = '@foodlens_phase2_history_deleted_ids:';
const HISTORY_SERVER_PULL_COOLDOWN_MS = 15_000;
const BARCODE_SAVE_DEDUP_WINDOW_MS = 10_000;

const historyServerPullInFlight = new Map<string, Promise<AnalysisRecord[] | null>>();
const historyServerPullLastAt = new Map<string, number>();

const historyMigrationMarkerKey = (userId: string): string => `${HISTORY_MIGRATION_MARKER_PREFIX}${userId}`;
const historyDeleteTombstoneKey = (userId: string): string => `${HISTORY_DELETE_TOMBSTONE_PREFIX}${userId}`;
const historyQueryKey = (userId: string): readonly [string, string] => ['history', userId] as const;

const sortByRecentTimestamp = (records: AnalysisRecord[]): AnalysisRecord[] =>
  [...records].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

const updateHistoryQueryCache = (userId: string, records: AnalysisRecord[]): void => {
  queryClient.setQueryData(historyQueryKey(userId), sortByRecentTimestamp(records));
};

const getHistoryDeleteSet = async (userId: string): Promise<Set<string>> => {
  const list = await SafeStorage.get<string[]>(historyDeleteTombstoneKey(userId), []);
  return new Set(list);
};

const saveHistoryDeleteSet = async (userId: string, deleteSet: Set<string>): Promise<void> => {
  await SafeStorage.set(historyDeleteTombstoneKey(userId), [...deleteSet]);
};

const getPendingHistoryMergeHints = async (
  userId: string
): Promise<{
  keepLocalOnlyIds: Set<string>;
  preserveLocalTimestampIds: Set<string>;
}> => {
  try {
    const queue = await getPhase2SyncQueueSnapshot();
    const keepLocalOnlyIds = new Set<string>();
    const preserveLocalTimestampIds = new Set<string>();
    queue.forEach((item) => {
      if (item.userId !== userId) return;
      if (item.entity !== 'history') return;
      if (item.state === 'synced') return;
      if (
        item.payload?.['kind'] === 'create' &&
        item.payload?.['entry'] &&
        typeof item.payload['entry'] === 'object'
      ) {
        const entry = item.payload['entry'] as Record<string, unknown>;
        const payloadId = typeof entry['id'] === 'string' ? entry['id'] : null;
        const id = (payloadId || item.idempotencyKey || '').trim();
        if (!id) return;
        keepLocalOnlyIds.add(id);
        return;
      }

      if (item.payload?.['kind'] === 'timestamp_patch') {
        const historyItemId =
          typeof item.payload['history_item_id'] === 'string'
            ? item.payload['history_item_id'].trim()
            : '';
        if (!historyItemId) return;
        preserveLocalTimestampIds.add(historyItemId);
      }
    });
    return {
      keepLocalOnlyIds,
      preserveLocalTimestampIds,
    };
  } catch {
    return {
      keepLocalOnlyIds: new Set<string>(),
      preserveLocalTimestampIds: new Set<string>(),
    };
  }
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
      const pendingMergeHints = await getPendingHistoryMergeHints(userId);
      const merged = mergeRemoteHistory(local, filteredRemote, {
        keepLocalOnlyIds: pendingMergeHints.keepLocalOnlyIds,
        preserveLocalTimestampIds: pendingMergeHints.preserveLocalTimestampIds,
      });
      await saveAnalyses(userId, merged);
      updateHistoryQueryCache(userId, merged);
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

const refreshHistoryAfterLocalRead = async (userId: string, local: AnalysisRecord[]): Promise<void> => {
  try {
    await dispatchPhase2SyncQueue();
    await syncHistoryFromServer(userId, local, { force: false });
  } catch (error) {
    logger.warn('[Phase2Sync] history background refresh failed', {
      request_id: 'unknown',
      user_id: userId,
      code: error instanceof Error ? error.message : 'PHASE2_HISTORY_BACKGROUND_REFRESH_FAILED',
    });
  }
};

const deleteHistoryItemsFromServer = async (
  userId: string,
  analysisIds: string[]
): Promise<void> => {
  const logHistoryDeleteSyncFailure = (code: string, failedCount?: number): void => {
    logger.warn('[Phase2Sync] history delete remote sync failed', {
      request_id: 'unknown',
      user_id: userId,
      code,
      ...(typeof failedCount === 'number' ? { failed_count: failedCount } : {}),
    });
  };

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

    logHistoryDeleteSyncFailure('PHASE2_HISTORY_DELETE_SYNC_FAILED', failed.length);
  } catch (error) {
    logHistoryDeleteSyncFailure(
      error instanceof Error ? error.message : 'PHASE2_HISTORY_DELETE_SYNC_FAILED'
    );
  }
};

const extractBarcodeMarker = (rawData: unknown): string | null => {
  if (!rawData || typeof rawData !== 'object') return null;
  const payload = rawData as Record<string, unknown>;
  const candidates = [
    payload['scanned_barcode'],
    payload['barcode'],
    payload['BAR_CD'],
    payload['bar_cd'],
    payload['code'],
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim();
    if (normalized.length > 0) return normalized;
  }
  return null;
};

const isDuplicateRecentBarcodeSave = ({
  latestRecord,
  incomingData,
  incomingTimestamp,
}: {
  latestRecord: AnalysisRecord;
  incomingData: AnalyzedData;
  incomingTimestamp: Date;
}): boolean => {
  if (incomingData.isBarcode !== true || latestRecord.isBarcode !== true) return false;
  const elapsed = Math.abs(incomingTimestamp.getTime() - latestRecord.timestamp.getTime());
  if (elapsed > BARCODE_SAVE_DEDUP_WINDOW_MS) return false;

  const incomingBarcode = extractBarcodeMarker(incomingData.raw_data);
  const latestBarcode = extractBarcodeMarker(latestRecord.raw_data);
  if (incomingBarcode && latestBarcode) {
    return incomingBarcode === latestBarcode;
  }

  const incomingName = incomingData.foodName?.trim() || '';
  const latestName = latestRecord.foodName?.trim() || '';
  if (!incomingName || !latestName || incomingName !== latestName) return false;

  const incomingSource =
    incomingData.nutrition?.dataSource || (incomingData.raw_data as Record<string, unknown> | undefined)?.['source'];
  const latestSource =
    latestRecord.nutrition?.dataSource || (latestRecord.raw_data as Record<string, unknown> | undefined)?.['source'];
  return typeof incomingSource === 'string' && incomingSource === latestSource;
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

            const latest = analyses[0];
            if (latest && isDuplicateRecentBarcodeSave({
              latestRecord: latest,
              incomingData: data,
              incomingTimestamp: finalDate,
            })) {
              logger.info('[Dedupe] Skipping duplicate barcode save in short window', {
                user_id: userId,
                barcode: extractBarcodeMarker(data.raw_data) || 'unknown',
              });
              return latest;
            }

            const newRecord: AnalysisRecord = {
                ...data,
                id: generateId(),
                timestamp: finalDate, // Use the parsed original date
                updatedAt: new Date().toISOString(),
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
            updateHistoryQueryCache(userId, analyses);
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
            void refreshHistoryAfterLocalRead(userId, local);
            return local;
        } catch (error) {
            logger.error('Error fetching all analyses', error, 'AnalysisService');
            return [];
        }
    },

    syncHistoryFromCloud: async (
      userId: string,
      options: { force?: boolean } = {}
    ): Promise<AnalysisRecord[]> => {
      try {
        startPhase2SyncRuntime();
        const local = await getStoredAnalyses(userId);
        const remote = await syncHistoryFromServer(userId, local, {
          force: options.force === true,
        });
        if (Array.isArray(remote)) return remote;
        return local;
      } catch (error) {
        logger.warn('[Phase2Sync] background history sync failed', {
          request_id: 'unknown',
          user_id: userId,
          code: error instanceof Error ? error.message : 'PHASE2_HISTORY_BACKGROUND_SYNC_FAILED',
        });
        return getStoredAnalyses(userId);
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
                updateHistoryQueryCache(userId, filtered);
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
            startPhase2SyncRuntime();
            const analyses = await getStoredAnalyses(userId);
            const index = analyses.findIndex(a => a.id === analysisId);
            
            if (index !== -1) {
                const previousUpdatedAt = analyses[index].updatedAt;
                analyses[index].timestamp = newTimestamp;
                await saveAnalyses(userId, analyses);
                updateHistoryQueryCache(userId, analyses);
                await enqueueHistoryTimestampPatch(userId, {
                  kind: 'timestamp_patch',
                  history_item_id: analysisId,
                  timestamp: newTimestamp.toISOString(),
                  expected_updated_at: previousUpdatedAt,
                });
                await flushHistoryWrites(userId);
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
