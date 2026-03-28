import * as FileSystem from 'expo-file-system/legacy';
import { AI_REQUEST_MAX_RETRIES, ANALYSIS_TIMEOUT_MS } from '../constants';
import { getAllergyString } from '../allergy';
import { uploadWithRetry } from '../upload';
import { ServerConfig } from '../serverConfig';
import { resolveRequestLocale } from './requestLocale';
import { assertAnalysisResponseContract } from '../contracts';
import { compressForUpload } from './imageCompress';
import {
  buildImageCacheKey,
  buildImageContentHash,
  getAiCacheValue,
  setAiCacheValue,
} from '../cache';

type ProgressCallback = (progress: number) => void;

type AnalyzeUploadParams = {
  endpointPath: '/analyze' | '/analyze/label' | '/analyze/smart';
  imageUri: string;
  isoCountryCode: string;
  onProgress?: ProgressCallback;
};

const createRequestId = (endpointPath: AnalyzeUploadParams['endpointPath']): string => {
  const suffix = Math.random().toString(16).slice(2, 10);
  const endpoint = endpointPath.replace(/\//g, '-') || 'analyze';
  return `${endpoint}-${Date.now().toString(36)}-${suffix}`;
};

export const performMultipartAnalysisUpload = async ({
  endpointPath,
  imageUri,
  isoCountryCode,
  onProgress,
}: AnalyzeUploadParams): Promise<unknown> => {
  const activeServerUrl = await ServerConfig.getServerUrl();
  const allergyString = await getAllergyString();
  const locale = await resolveRequestLocale();

  // Compress image before upload (resizes to 1536px, JPEG 80%)
  const compressedUri = await compressForUpload(imageUri);
  const requestId = createRequestId(endpointPath);
  let cacheKey: string | null = null;
  try {
    const imageHash = await buildImageContentHash(compressedUri);
    cacheKey = buildImageCacheKey({
      endpoint: endpointPath,
      imageHash,
      allergyInfo: allergyString,
      locale,
      isoCountryCode,
    });
    const cached = await getAiCacheValue<unknown>(cacheKey);
    if (cached) {
      console.log('[AI Cache] cache_hit=true', { endpointPath, request_id: requestId });
      assertAnalysisResponseContract(cached, endpointPath);
      return cached;
    }
  } catch (cacheError) {
    console.warn('[AI Cache] key/hash read failed, skipping cache for this request', {
      endpointPath,
      request_id: requestId,
      error: cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
    cacheKey = null;
  }

  const uploadResult = await uploadWithRetry(
    `${activeServerUrl}${endpointPath}`,
    compressedUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      headers: {
        'X-Request-Id': requestId,
      },
      parameters: {
        allergy_info: allergyString,
        iso_country_code: isoCountryCode,
        locale,
      },
    },
    AI_REQUEST_MAX_RETRIES,
    ANALYSIS_TIMEOUT_MS,
    onProgress,
  );

  const parsed = JSON.parse(uploadResult.body) as unknown;
  assertAnalysisResponseContract(parsed, endpointPath);
  if (cacheKey) {
    try {
      await setAiCacheValue(cacheKey, parsed);
    } catch (cacheWriteError) {
      console.warn('[AI Cache] write failed', {
        endpointPath,
        request_id: requestId,
        error: cacheWriteError instanceof Error ? cacheWriteError.message : String(cacheWriteError),
      });
    }
  }
  return parsed;
};

export const rethrowTimeoutAsColdStartMessage = (
  error: any,
  customMessage: string,
): never => {
  if (error.message?.includes('timed out')) {
    const parsed = /after\s+(\d+)\s*ms/i.exec(String(error.message));
    const timeoutSeconds = parsed ? Math.round(Number(parsed[1]) / 1000) : Math.round(ANALYSIS_TIMEOUT_MS / 1000);
    throw new Error(customMessage.replace('{timeout}', String(timeoutSeconds)));
  }
  throw error;
};
