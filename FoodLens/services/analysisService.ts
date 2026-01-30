import { db } from './firebaseConfig';
import { collection, addDoc, query, orderBy, limit, getDocs, Timestamp, where, deleteDoc, doc } from 'firebase/firestore';
import { AnalyzedData } from './ai';

export interface AnalysisRecord extends AnalyzedData {
    id: string;
    timestamp: Date;
    imageUri?: string; // Optional thumbnail
    location?: {
        latitude: number;
        longitude: number;
        country?: string; // e.g., "Japan"
        city?: string;    // e.g., "Tokyo"
        isoCountryCode?: string; // e.g., "JP"
    }
}

export const AnalysisService = {
    /**
     * Save a new analysis result to Firestore under the user's collection
     */
    saveAnalysis: async (userId: string, data: AnalyzedData, imageUri?: string, location?: AnalysisRecord['location']) => {
        try {
            const analysesRef = collection(db, 'users', userId, 'analyses');

            // Firestore crashes on 'undefined' values.
            // We use JSON round-trip to strip undefined fields (like translationCard or box_2d)
            const payload = {
                ...data,
                imageUri: imageUri || null,
                location: location || null,
            };
            const cleanPayload = JSON.parse(JSON.stringify(payload));

            await addDoc(analysesRef, {
                ...cleanPayload,
                timestamp: Timestamp.now()
            });
            console.log('Analysis saved successfully');
        } catch (error) {
            console.error('Error saving analysis:', error);
            throw error;
        }
    },

    /**
     * Get recent analyses for the Home screen (e.g. top 2)
     */
    getRecentAnalyses: async (userId: string, limitCount: number = 2): Promise<AnalysisRecord[]> => {
        try {
            const analysesRef = collection(db, 'users', userId, 'analyses');
            const q = query(analysesRef, orderBy('timestamp', 'desc'), limit(limitCount));
            const snapshot = await getDocs(q);
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: (doc.data().timestamp as Timestamp).toDate()
            })) as AnalysisRecord[];
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
            const analysesRef = collection(db, 'users', userId, 'analyses');
            const q = query(analysesRef, orderBy('timestamp', 'desc'));
            const snapshot = await getDocs(q);
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: (doc.data().timestamp as Timestamp).toDate()
            })) as AnalysisRecord[];
        } catch (error) {
            console.error('Error fetching all analyses:', error);
            return [];
        }
    },

    /**
     * Delete an analysis record
     */
    deleteAnalysis: async (userId: string, analysisId: string) => {
        try {
            const path = `users/${userId}/analyses/${analysisId}`;
            const analysisRef = doc(db, 'users', userId, 'analyses', analysisId);
            await deleteDoc(analysisRef);
            console.log(`[DELETE] Success: ${path}`);
        } catch (error) {
            console.error('Error deleting analysis:', error);
            throw error;
        }
    }
};
