import { useRef, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { autoSaveService } from './autoSaveService';
import { shouldAutoSaveResult } from './autoSaveUtils';
import { parseResultRouteFlags, type ResultSearchParams } from '@/services/contracts/resultRoute';

export function useAutoSave(
    result: any, 
    locationData: any, 
    rawImageUri: string | undefined, 
    timestamp?: string | null,
    onSave?: (savedRecord: any) => void
) {
  const params = useLocalSearchParams<ResultSearchParams>();
  const { isNew } = parseResultRouteFlags(params);
  const hasSaved = useRef(false);

  useEffect(() => {
    if (shouldAutoSaveResult(!!result, hasSaved.current, isNew)) {
        hasSaved.current = true;
        
        console.log("[useAutoSave] Saving new analysis...");
        autoSaveService.save({
            result,
            rawImageUri,
            locationData,
            timestamp,
        })
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
