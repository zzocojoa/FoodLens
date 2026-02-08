import { useRef, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AnalysisService } from '../../services/analysisService';

export function useAutoSave(
    result: any, 
    locationData: any, 
    rawImageUri: string | undefined, 
    timestamp?: string | null,
    onSave?: (savedRecord: any) => void
) {
  const { fromStore, isNew } = useLocalSearchParams();
  const hasSaved = useRef(false);

  useEffect(() => {
    // Logic from original result.tsx
    // const isFromStore = fromStore === 'true'; // Not strictly used in original logic, but contextually relevant
    const shouldSave = isNew === 'true';
    
    if (result && !hasSaved.current && shouldSave) {
        hasSaved.current = true;
        const TEST_UID = "test-user-v1"; 
        
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
  }, [result, locationData, rawImageUri, isNew, timestamp]); // Adding onSave to dependency might cause loop if unstable
}
