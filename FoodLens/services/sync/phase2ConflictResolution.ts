import {
  getPhase2ConflictedOperations,
  resolvePhase2Conflict,
} from './phase2SyncQueue_Logic';
import type {
  Phase2ConflictResolution,
  Phase2SyncEntity,
  Phase2SyncOperation,
} from './phase2Sync.types_Structure';

const MANUAL_MERGE_ENTITIES = new Set<Phase2SyncEntity>([
  'profile',
  'allergies',
  'settings',
]);

const isManualMergeEntity = (entity: Phase2SyncEntity): boolean =>
  MANUAL_MERGE_ENTITIES.has(entity);

export const getManualMergeConflictOperationsForUser = async (
  userId: string
): Promise<Phase2SyncOperation[]> => {
  const conflicts = await getPhase2ConflictedOperations(userId);
  return conflicts.filter((item) => isManualMergeEntity(item.entity));
};

export const resolveManualMergeConflictsForUser = async ({
  userId,
  resolution,
}: {
  userId: string;
  resolution: Phase2ConflictResolution;
}): Promise<{
  total: number;
  resolved: number;
  remaining: number;
}> => {
  const conflicts = await getManualMergeConflictOperationsForUser(userId);
  let resolved = 0;

  for (const item of conflicts) {
    const ok = await resolvePhase2Conflict({
      operationId: item.id,
      resolution,
    });
    if (ok) {
      resolved += 1;
    }
  }

  const remainingConflicts = await getManualMergeConflictOperationsForUser(userId);

  return {
    total: conflicts.length,
    resolved,
    remaining: remainingConflicts.length,
  };
};
