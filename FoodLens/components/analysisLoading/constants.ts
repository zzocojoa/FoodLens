import { AnalysisLoadingColors } from './types';

export const STEPS = ['Image Ready', 'Uploading', 'AI Analyzing', 'Syncing Results'];
export const DEFAULT_IMAGE_URI =
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop';
export const LONG_WAIT_THRESHOLD_MS = 8000;

export const buildLoadingColors = (isError: boolean): AnalysisLoadingColors => ({
    primary: isError ? '#EF4444' : '#3B82F6',
    orbit: isError ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)',
    orbitInner: isError ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)',
    ripple: isError ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)',
    hub: isError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)',
    icon: isError ? '#EF4444' : '#3B82F6',
});
