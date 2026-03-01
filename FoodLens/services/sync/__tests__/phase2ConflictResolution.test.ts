import type { Phase2SyncOperation } from '../phase2Sync.types';
import {
  getManualMergeConflictOperationsForUser,
  resolveManualMergeConflictsForUser,
} from '../phase2ConflictResolution';
import {
  getPhase2ConflictedOperations,
  resolvePhase2Conflict,
} from '../phase2SyncQueue_Logic';

jest.mock('../phase2SyncQueue_Logic', () => ({
  getPhase2ConflictedOperations: jest.fn(),
  resolvePhase2Conflict: jest.fn(),
}));

const mockedGetPhase2ConflictedOperations = getPhase2ConflictedOperations as jest.Mock;
const mockedResolvePhase2Conflict = resolvePhase2Conflict as jest.Mock;

const buildConflict = (
  id: string,
  entity: Phase2SyncOperation['entity'],
  userId: string = 'usr_a'
): Phase2SyncOperation => ({
  id,
  userId,
  entity,
  state: 'conflicted',
  payload: {},
  attempts: 1,
  nextAttemptAt: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('phase2ConflictResolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters manual-merge entities from conflicted operations', async () => {
    mockedGetPhase2ConflictedOperations.mockResolvedValue([
      buildConflict('op-profile', 'profile'),
      buildConflict('op-history', 'history'),
      buildConflict('op-settings', 'settings'),
    ]);

    const result = await getManualMergeConflictOperationsForUser('usr_a');

    expect(mockedGetPhase2ConflictedOperations).toHaveBeenCalledWith('usr_a');
    expect(result.map((item) => item.id)).toEqual(['op-profile', 'op-settings']);
  });

  it('resolves manual-merge conflicts and reports remaining count', async () => {
    mockedGetPhase2ConflictedOperations
      .mockResolvedValueOnce([
        buildConflict('op-profile', 'profile'),
        buildConflict('op-history', 'history'),
        buildConflict('op-allergies', 'allergies'),
      ])
      .mockResolvedValueOnce([buildConflict('op-history', 'history')]);
    mockedResolvePhase2Conflict.mockResolvedValue(true);

    const result = await resolveManualMergeConflictsForUser({
      userId: 'usr_a',
      resolution: 'use_local',
    });

    expect(mockedResolvePhase2Conflict).toHaveBeenCalledTimes(2);
    expect(mockedResolvePhase2Conflict).toHaveBeenNthCalledWith(1, {
      operationId: 'op-profile',
      resolution: 'use_local',
    });
    expect(mockedResolvePhase2Conflict).toHaveBeenNthCalledWith(2, {
      operationId: 'op-allergies',
      resolution: 'use_local',
    });
    expect(result).toEqual({
      total: 2,
      resolved: 2,
      remaining: 0,
    });
  });
});
