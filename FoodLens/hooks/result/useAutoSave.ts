import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { autoSaveService } from './autoSaveService';
import { shouldAutoSaveResult } from './autoSaveUtils';
import { parseResultRouteFlags, type ResultSearchParams } from '@/services/contracts/resultRoute';
import type { AnalyzedData } from '@/services/ai';
import type { AnalysisRecord } from '@/services/analysis/types';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';
type AutoSaveLocation = AnalysisRecord['location'] | Record<string, unknown> | null;

type UseAutoSaveResult = {
  saveStatus: AutoSaveStatus;
  retrySave: () => void;
};

export function useAutoSave(
  result: AnalyzedData | null,
  locationData: AutoSaveLocation,
  rawImageUri: string | undefined,
  timestamp: string | null | undefined,
  onSave: ((savedRecord: AnalysisRecord) => void) | undefined
): UseAutoSaveResult {
  const params = useLocalSearchParams<ResultSearchParams>();
  const { isNew } = parseResultRouteFlags(params);
  const hasSaved = useRef(false);
  const isSaving = useRef(false);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>('idle');
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!shouldAutoSaveResult(!!result, hasSaved.current, isNew) || isSaving.current || !result) {
      return;
    }

    isSaving.current = true;
    setSaveStatus('saving');

    autoSaveService
      .save({
        result,
        rawImageUri,
        locationData,
        timestamp,
      })
      .then((savedRecord) => {
        hasSaved.current = true;
        setSaveStatus('saved');
        if (onSave) {
          onSave(savedRecord);
        }
      })
      .catch((error: unknown) => {
        setSaveStatus('failed');
        console.error('[useAutoSave] Failed:', error);
      })
      .finally(() => {
        isSaving.current = false;
      });
  }, [result, locationData, rawImageUri, isNew, timestamp, onSave, retryNonce]);

  const retrySave = useCallback(() => {
    if (!result || !isNew || hasSaved.current || isSaving.current) {
      return;
    }
    setRetryNonce((current) => current + 1);
  }, [isNew, result]);

  return {
    saveStatus,
    retrySave,
  };
}
