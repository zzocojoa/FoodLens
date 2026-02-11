import * as FileSystem from 'expo-file-system/legacy';
import { ANALYSIS_TIMEOUT_MS } from './constants';

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timeoutId: any;
    const timeout = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Operation timed out after ${ms} ms`));
        }, ms);
    });

    return Promise.race([promise, timeout]).finally(() => {
        clearTimeout(timeoutId);
    });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const uploadWithRetry = async (
    url: string,
    imageUri: string,
    options: any,
    maxRetries = 3,
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

            const result = await withTimeout(task.uploadAsync(), ANALYSIS_TIMEOUT_MS);

            if (!result) throw new Error('Upload failed: No result');

            if (result.status === 200) {
                return result;
            }

            if (result.status >= 400 && result.status < 500 && result.status !== 429) {
                throw new Error(`Server rejected request (${result.status}): ${result.body}`);
            }

            throw new Error(`Server returned status ${result.status}`);
        } catch (error: any) {
            console.warn(`Attempt ${attempt} failed:`, error.message);
            lastError = error;

            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`Waiting ${delay}ms before next retry...`);
                await sleep(delay);
            }
        }
    }

    throw lastError;
};
