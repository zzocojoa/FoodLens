import { SafeStorage } from './storage';
import { AnalyzedData } from './ai';
import { deleteImage } from './imageStorage';

const ANALYSES_STORAGE_KEY = '@foodlens_analyses';

export interface AnalysisRecord extends AnalyzedData {
    id: string;
    timestamp: Date;
    imageUri?: string;
    location?: {
        latitude: number;
        longitude: number;
        country?: string;
        city?: string;
        district?: string;
        subregion?: string;
        formattedAddress?: string;
        isoCountryCode?: string;
    }
}

// Helper to generate unique ID
const generateId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

// Helper to get all analyses from storage
const getStoredAnalyses = async (): Promise<AnalysisRecord[]> => {
    // SafeStorage handles try-catch and JSON parsing
    // Returns [] if error or null
    const analyses = await SafeStorage.get<any[]>(ANALYSES_STORAGE_KEY, []);

    // Convert timestamp strings back to Date objects
    // Note: If SafeStorage cleared data, analyses is [], so map returns []
    return analyses.map((a: any) => ({
        ...a,
        timestamp: new Date(a.timestamp)
    }));
};

// Helper to save all analyses to storage
const saveAnalyses = async (analyses: AnalysisRecord[]): Promise<void> => {
    await SafeStorage.set(ANALYSES_STORAGE_KEY, analyses);
};

export const AnalysisService = {
    /**
     * Save a new analysis result to local storage
     */
    saveAnalysis: async (userId: string, data: AnalyzedData, imageUri?: string, location?: AnalysisRecord['location'], originalTimestamp?: string) => {
        try {
            const analyses = await getStoredAnalyses();
            
            // Timestamp Logic:
            // originalTimestamp should already be normalized ISO string from camera.tsx -> dataStore -> result.tsx -> useAutoSave
            // But we do a safety check just in case.
            let finalDate = new Date();
            
            if (originalTimestamp) {
                const parsed = new Date(originalTimestamp);
                if (!isNaN(parsed.getTime())) {
                    finalDate = parsed;
                }
            }

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
            
            await saveAnalyses(analyses);
            console.log('Analysis saved successfully with date:', finalDate.toISOString());
            return newRecord;
        } catch (error) {
            console.error('Error saving analysis:', error);
            throw error;
        }
    },

    /**
     * Get recent analyses for the Home screen
     */
    getRecentAnalyses: async (userId: string, limitCount: number = 2): Promise<AnalysisRecord[]> => {
        try {
            const analyses = await getStoredAnalyses();
            return analyses.slice(0, limitCount);
        } catch (error) {
            console.error('Error fetching recent analyses:', error);
            return [];
        }
    },

    /**
     * Get all analyses for the History screen
     */
    getAllAnalyses: async (userId: string): Promise<AnalysisRecord[]> => {
        try {
            return await getStoredAnalyses();
        } catch (error) {
            console.error('Error fetching all analyses:', error);
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
            const analyses = await getStoredAnalyses();
            const idsToDelete = new Set(analysisIds);
            const filtered = analyses.filter(a => !idsToDelete.has(a.id));
            
            // Clean up associated image files
            const deleted = analyses.filter(a => idsToDelete.has(a.id));
            for (const record of deleted) {
                await deleteImage(record.imageUri).catch(() => {});
            }
            
            if (filtered.length !== analyses.length) {
                await saveAnalyses(filtered);
                console.log(`[DELETE] Batch Success: ${analysisIds.length} items requested, ${analyses.length - filtered.length} deleted`);
            }
        } catch (error) {
            console.error('Error deleting analyses:', error);
            throw error;
        }
    },

    /**
     * Update the timestamp of a specific analysis record
     */
    updateAnalysisTimestamp: async (userId: string, analysisId: string, newTimestamp: Date) => {
        try {
            const analyses = await getStoredAnalyses();
            const index = analyses.findIndex(a => a.id === analysisId);
            
            if (index !== -1) {
                analyses[index].timestamp = newTimestamp;
                // Optional: Re-sort if strictly chronological
                await saveAnalyses(analyses);
                console.log(`[UPDATE] Updated timestamp for ${analysisId} to ${newTimestamp.toISOString()}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error updating analysis timestamp:', error);
            return false;
        }
    }
};
