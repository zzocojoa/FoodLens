import { Colors } from '@/constants/theme';

export type StatusMeta = {
    containerStyle: { backgroundColor: string; borderColor: string };
    kind: 'ok' | 'avoid' | 'ask';
};

/**
 * Returns metadata for the safety status icon and container styling.
 */
export const getStatusMeta = (type: string | undefined): StatusMeta => {
    // Theme is passed externally or accessed via global theme context if needed, 
    // but here we align with previous implementation's pattern.
    // For simplicity, we use generic colors if theme is unavailable, 
    // but we should match the intended mapping.
    
    switch (type) {
        case 'ok':
            return {
                containerStyle: { backgroundColor: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.2)' },
                kind: 'ok',
            };
        case 'avoid':
            return {
                containerStyle: { backgroundColor: 'rgba(244, 63, 94, 0.1)', borderColor: 'rgba(244, 63, 94, 0.2)' },
                kind: 'avoid',
            };
        case 'ask':
        default:
            return {
                containerStyle: { backgroundColor: 'rgba(202, 138, 4, 0.1)', borderColor: 'rgba(202, 138, 4, 0.2)' },
                kind: 'ask',
            };
    }
};
