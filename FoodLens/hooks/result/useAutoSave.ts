import { useRef, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AnalysisService } from '../../services/analysisService';
import { shouldAutoSaveResult, TEST_UID } from './autoSaveUtils';

export function useAutoSave(
    result: any, 
    locationData: any, 
    rawImageUri: string | undefined, 
    timestamp?: string | null,
    onSave?: (savedRecord: any) => void
) {
  const { isNew } = useLocalSearchParams();
  const hasSaved = useRef(false);

  useEffect(() => {
    if (shouldAutoSaveResult(!!result, hasSaved.current, isNew)) {
        hasSaved.current = true;
        
        console.log("[useAutoSave] Saving new analysis...");
        AnalysisService.saveAnalysis(TEST_UID, result, rawImageUri, locationData, timestamp || undefined)
        .then(savedRecord => {
            if (onSave && savedRecord) {
                onSave(savedRecord);
            }
        })
        .catch(err => {
            console.error("[useAutoSave] Failed:", err);
        });
    }
  }, [result, locationData, rawImageUri, isNew, timestamp, onSave]);
}
