import { getCurrentUserId } from '@/services/auth/currentUser';

export const getAllergiesUserId = (): string => getCurrentUserId();

export const ALLERGIES_COPY = {
    title: { key: 'allergies.title', fallback: 'My Allergies' },
    description: {
        key: 'allergies.description',
        fallback: 'This includes your saved allergies.\nAI uses this to analyze food safety.',
    },
    emptyTitle: { key: 'allergies.empty.title', fallback: 'All Clear!' },
    emptyDescription: { key: 'allergies.empty.description', fallback: 'No allergy information registered.' },
} as const;
