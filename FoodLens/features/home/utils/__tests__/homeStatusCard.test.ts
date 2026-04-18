import {
  countHomeStatusSignals,
  filterScansByHomeStatusSignal,
  resolveHomeStatusVariant,
} from '../homeStatusCard';
import { AnalysisRecord } from '../../../../services/analysisService';

const buildRecord = (
  id: string,
  safetyStatus: AnalysisRecord['safetyStatus']
): AnalysisRecord => ({
  id,
  foodName: `${id}-food`,
  safetyStatus,
  ingredients: [],
  timestamp: new Date('2026-04-15T00:00:00.000Z'),
});

describe('homeStatusCard', () => {
  it('counts safety signals by status', () => {
    const records: AnalysisRecord[] = [
      buildRecord('safe-1', 'SAFE'),
      buildRecord('safe-2', 'SAFE'),
      buildRecord('caution-1', 'CAUTION'),
      buildRecord('danger-1', 'DANGER'),
    ];

    expect(countHomeStatusSignals(records)).toEqual({
      safe: 2,
      caution: 1,
      danger: 1,
      total: 4,
    });
  });

  it('resolves variant priority as danger, caution, safe, then empty', () => {
    expect(
      resolveHomeStatusVariant({
        safe: 2,
        caution: 0,
        danger: 1,
        total: 3,
      })
    ).toBe('DANGER');

    expect(
      resolveHomeStatusVariant({
        safe: 2,
        caution: 1,
        danger: 0,
        total: 3,
      })
    ).toBe('CAUTION');

    expect(
      resolveHomeStatusVariant({
        safe: 3,
        caution: 0,
        danger: 0,
        total: 3,
      })
    ).toBe('SAFE');

    expect(
      resolveHomeStatusVariant({
        safe: 0,
        caution: 0,
        danger: 0,
        total: 0,
      })
    ).toBe('EMPTY');
  });

  it('filters scans by active signal and preserves all scans when signal is null', () => {
    const records: AnalysisRecord[] = [
      buildRecord('safe-1', 'SAFE'),
      buildRecord('caution-1', 'CAUTION'),
      buildRecord('danger-1', 'DANGER'),
    ];

    expect(filterScansByHomeStatusSignal(records, null)).toHaveLength(3);
    expect(filterScansByHomeStatusSignal(records, 'SAFE')).toEqual([records[0]]);
    expect(filterScansByHomeStatusSignal(records, 'CAUTION')).toEqual([records[1]]);
    expect(filterScansByHomeStatusSignal(records, 'DANGER')).toEqual([records[2]]);
  });
});
