import { SafeStorage } from './storage';
import { AnalyzedData } from './ai';

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
    saveAnalysis: async (userId: string, data: AnalyzedData, imageUri?: string, location?: AnalysisRecord['location']) => {
        try {
            const analyses = await getStoredAnalyses();
            
            const newRecord: AnalysisRecord = {
                ...data,
                id: generateId(),
                timestamp: new Date(),
                imageUri: imageUri || undefined,
                location: location || undefined,
            };

            // Add to beginning (newest first)
            analyses.unshift(newRecord);
            
            await saveAnalyses(analyses);
            console.log('Analysis saved successfully');
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
            
            if (filtered.length !== analyses.length) {
                await saveAnalyses(filtered);
                console.log(`[DELETE] Batch Success: ${analysisIds.length} items requested, ${analyses.length - filtered.length} deleted`);
            }
        } catch (error) {
            console.error('Error deleting analyses:', error);
            throw error;
        }
    }
};
