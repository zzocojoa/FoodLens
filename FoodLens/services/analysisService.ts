import { AnalyzedData } from './ai';
import { deleteImage } from './imageStorage';
import { generateId, resolveRecordTimestamp } from './analysis/helpers';
import { getStoredAnalyses, saveAnalyses } from './analysis/storage';
import { AnalysisRecord } from './analysis/types';
import { logger } from './logger';

export type { AnalysisRecord } from './analysis/types';

export const AnalysisService = {
    /**
     * Save a new analysis result to local storage
     */
    saveAnalysis: async (userId: string, data: AnalyzedData, imageUri?: string, location?: AnalysisRecord['location'], originalTimestamp?: string) => {
        try {
            const analyses = await getStoredAnalyses();
            const finalDate = resolveRecordTimestamp(originalTimestamp);

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
            const analyses = await getStoredAnalyses();
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
            return await getStoredAnalyses();
        } catch (error) {
            logger.error('Error fetching all analyses', error, 'AnalysisService');
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
            const analyses = await getStoredAnalyses();
            const index = analyses.findIndex(a => a.id === analysisId);
            
            if (index !== -1) {
                analyses[index].timestamp = newTimestamp;
                // Optional: Re-sort if strictly chronological
                await saveAnalyses(analyses);
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
