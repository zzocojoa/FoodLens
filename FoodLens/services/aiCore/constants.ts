import { getCurrentUserId } from '@/services/auth/currentUser';

const EXPO_PUBLIC_ANALYSIS_SERVER_URL_KEY = 'EXPO_PUBLIC_ANALYSIS_SERVER_URL';
const EXPO_PUBLIC_AI_ASYNC_ANALYZE_ENABLED_KEY = 'EXPO_PUBLIC_AI_ASYNC_ANALYZE_ENABLED';
const EXPO_PUBLIC_AI_CACHE_TTL_SECONDS_KEY = 'EXPO_PUBLIC_AI_CACHE_TTL_SECONDS';
export const STORAGE_KEY = 'foodlens_custom_server_url';
export const getAiUserId = (): string => getCurrentUserId();
export const ANALYSIS_TIMEOUT_MS = 15000;
export const ANALYSIS_SUBMIT_TIMEOUT_MS = 15000;
export const ANALYSIS_POLL_TIMEOUT_MS = 15000;
export const AI_REQUEST_MAX_RETRIES = 3;
export const AI_RETRY_BASE_DELAY_MS = 1000;
export const BARCODE_LOOKUP_TIMEOUT_MS = 15000;
export const BARCODE_LOOKUP_MAX_RETRIES = AI_REQUEST_MAX_RETRIES;
export const AI_CACHE_MAX_ENTRIES = 200;

const readDefinedEnvValue = (value: string | undefined): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : undefined;
};

const readRuntimeEnvValue = (key: string): string | undefined => {
    const rawValue = process.env[key];
    return readDefinedEnvValue(rawValue);
};

export const normalizeServerUrl = (value: string | undefined): string | undefined => {
    if (value === undefined) {
        return undefined;
    }

    const normalizedValue = value.trim().replace(/\/+$/, '');
    return normalizedValue.length > 0 ? normalizedValue : undefined;
};

const selectEnvValue = (
    runtimeValue: string | undefined,
    staticValue: string | undefined,
): string | undefined => runtimeValue ?? staticValue;

const readExpoPublicAnalysisServerUrlStaticValue = (): string | undefined =>
    normalizeServerUrl(process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL']);

const readExpoPublicAiAsyncAnalyzeEnabledStaticValue = (): string | undefined =>
    readDefinedEnvValue(process.env['EXPO_PUBLIC_AI_ASYNC_ANALYZE_ENABLED']);

const readExpoPublicAiCacheTtlSecondsStaticValue = (): string | undefined =>
    readDefinedEnvValue(process.env['EXPO_PUBLIC_AI_CACHE_TTL_SECONDS']);

export const readExpoPublicAnalysisServerUrl = (): string | undefined => {
    const runtimeValue = normalizeServerUrl(readRuntimeEnvValue(EXPO_PUBLIC_ANALYSIS_SERVER_URL_KEY));
    const staticValue = readExpoPublicAnalysisServerUrlStaticValue();
    return selectEnvValue(runtimeValue, staticValue);
};

const readExpoPublicAiAsyncAnalyzeEnabledValue = (): string | undefined => {
    const runtimeValue = readRuntimeEnvValue(EXPO_PUBLIC_AI_ASYNC_ANALYZE_ENABLED_KEY);
    const staticValue = readExpoPublicAiAsyncAnalyzeEnabledStaticValue();
    return selectEnvValue(runtimeValue, staticValue);
};

const readExpoPublicAiCacheTtlSecondsValue = (): string | undefined => {
    const runtimeValue = readRuntimeEnvValue(EXPO_PUBLIC_AI_CACHE_TTL_SECONDS_KEY);
    const staticValue = readExpoPublicAiCacheTtlSecondsStaticValue();
    return selectEnvValue(runtimeValue, staticValue);
};

const readExpoPublicBooleanValue = (envValue: string | undefined, fallback: boolean): boolean => {
    if (envValue === undefined) {
        return fallback;
    }

    const loweredValue = envValue.toLowerCase();
    return envValue !== '0' && loweredValue !== 'false';
};

const readExpoPublicNumberValue = (envValue: string | undefined, fallback: number): number => {
    if (envValue === undefined) {
        return fallback;
    }

    const parsedValue = Number(envValue);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

export const AI_ASYNC_ANALYZE_ENABLED = readExpoPublicBooleanValue(
    readExpoPublicAiAsyncAnalyzeEnabledValue(),
    true,
);
export const AI_CACHE_TTL_SECONDS = readExpoPublicNumberValue(
    readExpoPublicAiCacheTtlSecondsValue(),
    86400,
);
