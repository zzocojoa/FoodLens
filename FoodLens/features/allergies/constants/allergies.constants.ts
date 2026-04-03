import { getCurrentUserId } from '@/services/auth/currentUser';

export const getAllergiesUserId = (): string => getCurrentUserId();

export const ALLERGIES_COPY = {
    title: { key: 'allergies.title', fallback: 'My Allergies' },
    description: {
        key: 'allergies.description',
        fallback:
            'This includes your saved allergies and dietary restrictions.\nAI uses this to analyze food safety.',
    },
    errorTitle: { key: 'allergies.error.title', fallback: 'Unable to load allergy info' },
    errorDescription: {
        key: 'allergies.error.description',
        fallback: 'We could not load your allergy information. Please try again.',
    },
    emptyTitle: { key: 'allergies.empty.title', fallback: 'All Clear!' },
    emptyDescription: { key: 'allergies.empty.description', fallback: 'No allergy information registered.' },
    travelerCardPreviewTitle: {
        key: 'allergies.travelerCardPreviewTitle',
        fallback: 'Traveler Card Preview',
    },
} as const;
