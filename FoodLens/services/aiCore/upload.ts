import * as FileSystem from 'expo-file-system/legacy';
import { runWithAnalysisTimeout, sleep } from './internal/retryUtils_Logic';

type UploadErrorDetail = {
    message?: string;
    code?: string;
    request_id?: string;
    retry_after_seconds?: number;
};

type RetryableUploadError = Error & {
    retryAfterMs?: number;
    requestId?: string;
    code?: string;
    nonRetryable?: boolean;
};

const parseUploadErrorDetail = (rawBody: string): UploadErrorDetail | null => {
    if (!rawBody) return null;
    try {
        const parsed = JSON.parse(rawBody) as { detail?: UploadErrorDetail } | UploadErrorDetail;
        const detail = (parsed as { detail?: UploadErrorDetail }).detail ?? (parsed as UploadErrorDetail);
        if (!detail || typeof detail !== 'object') return null;
        return detail;
    } catch {
        return null;
    }
};

const parseRetryAfterHeader = (headers: unknown): number | null => {
    if (!headers || typeof headers !== 'object') return null;
    const pairs = Object.entries(headers as Record<string, unknown>);
    for (const [rawKey, rawValue] of pairs) {
        if (rawKey.toLowerCase() !== 'retry-after') continue;
        const parsed = Number(rawValue);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
};

const buildServerErrorMessage = (status: number, detail: UploadErrorDetail | null): string => {
    const message = detail?.message || `Server returned status ${status}`;
    const codePart = detail?.code ? ` code=${detail.code}` : '';
    const requestIdPart = detail?.request_id ? ` request_id=${detail.request_id}` : '';
    return `${message}${codePart}${requestIdPart}`;
};

export const uploadWithRetry = async (
    url: string,
    imageUri: string,
    options: any,
    maxRetries = 3,
    timeoutMs?: number,
    onProgress?: (progress: number) => void
): Promise<FileSystem.FileSystemUploadResult> => {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Upload attempt ${attempt}/${maxRetries}`);

            const task = FileSystem.createUploadTask(url, imageUri, options, (data) => {
                const progress =
                    data.totalBytesExpectedToSend > 0
                        ? data.totalBytesSent / data.totalBytesExpectedToSend
                        : 0;
                if (onProgress) onProgress(progress);
            });

            const result = await runWithAnalysisTimeout(task.uploadAsync(), timeoutMs);

            if (!result) throw new Error('Upload failed: No result');

            if (result.status === 200) {
                return result;
            }

            const detail = parseUploadErrorDetail(result.body);
            const retryAfterFromHeader = parseRetryAfterHeader((result as { headers?: unknown }).headers);
            const retryAfterFromBody =
                typeof detail?.retry_after_seconds === 'number' && detail.retry_after_seconds > 0
                    ? detail.retry_after_seconds
                    : null;
            const retryAfterSeconds = retryAfterFromHeader ?? retryAfterFromBody;

            if (result.status >= 400 && result.status < 500 && result.status !== 429) {
                const nonRetryableError: RetryableUploadError = new Error(
                    buildServerErrorMessage(result.status, detail)
                ) as RetryableUploadError;
                nonRetryableError.nonRetryable = true;
                nonRetryableError.code = detail?.code;
                nonRetryableError.requestId = detail?.request_id;
                throw nonRetryableError;
            }

            const retryableError: RetryableUploadError = new Error(
                buildServerErrorMessage(result.status, detail)
            ) as RetryableUploadError;
            retryableError.code = detail?.code;
            retryableError.requestId = detail?.request_id;
            if (retryAfterSeconds && retryAfterSeconds > 0) {
                retryableError.retryAfterMs = retryAfterSeconds * 1000;
            }
            throw retryableError;
        } catch (error: any) {
            console.warn(`Attempt ${attempt} failed:`, error.message);
            lastError = error;

            if ((error as RetryableUploadError).nonRetryable) {
                throw error;
            }
            // Timed out uploads are often still processing on the backend.
            // Retrying immediately can duplicate expensive analyze requests.
            if (typeof error?.message === 'string' && /timed out/i.test(error.message)) {
                throw error;
            }

            if (attempt < maxRetries) {
                const delay =
                    typeof (error as RetryableUploadError).retryAfterMs === 'number' &&
                    (error as RetryableUploadError).retryAfterMs! > 0
                        ? (error as RetryableUploadError).retryAfterMs!
                        : Math.pow(2, attempt - 1) * 1000;
                console.log(`Waiting ${delay}ms before next retry...`);
                await sleep(delay);
            }
        }
    }

    throw lastError;
};
