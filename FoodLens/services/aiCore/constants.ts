import { getCurrentUserId } from '@/services/auth/currentUser';

export const DEFAULT_SERVER_URL = 'https://foodlens-2-w1xu.onrender.com';
export const STORAGE_KEY = 'foodlens_custom_server_url';
export const getAiUserId = (): string => getCurrentUserId();
export const ANALYSIS_TIMEOUT_MS = 15000;
export const ANALYSIS_SUBMIT_TIMEOUT_MS = 15000;
export const ANALYSIS_POLL_TIMEOUT_MS = 15000;
export const AI_REQUEST_MAX_RETRIES = 3;
export const AI_RETRY_BASE_DELAY_MS = 1000;
export const AI_ASYNC_ANALYZE_ENABLED = process.env['EXPO_PUBLIC_AI_ASYNC_ANALYZE_ENABLED'] !== '0';
export const BARCODE_LOOKUP_TIMEOUT_MS = 15000;
export const BARCODE_LOOKUP_MAX_RETRIES = AI_REQUEST_MAX_RETRIES;
export const AI_CACHE_TTL_SECONDS = Number(process.env['EXPO_PUBLIC_AI_CACHE_TTL_SECONDS'] || '86400');
export const AI_CACHE_MAX_ENTRIES = 200;
