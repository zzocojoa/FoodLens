import * as FileSystem from 'expo-file-system/legacy';

import {
  AI_ASYNC_ANALYZE_ENABLED,
  AI_REQUEST_MAX_RETRIES,
  AI_RETRY_BASE_DELAY_MS,
  ANALYSIS_POLL_TIMEOUT_MS,
  ANALYSIS_SUBMIT_TIMEOUT_MS,
} from '../constants';
import { getAllergyString } from '../allergy';
import { uploadWithRetryForAcceptedStatuses } from '../upload';
import { ServerConfig } from '../serverConfig';
import { resolveRequestLocale } from './requestLocale';
import {
  AnalysisJobMode,
  AnalysisJobStatus,
  AnalyzedData,
  PendingAnalysisJob,
} from '../types';
import {
  assertAnalysisJobStatusContract,
  assertAnalysisJobSubmitContract,
} from '../contracts';
import { mapAnalyzedData } from '../mappers';
import { logger } from '@/services/logger';
import { sleep } from './retryUtils';
import {
  buildImageCacheKey,
  buildImageContentHash,
  getAiCacheValue,
  setAiCacheValue,
} from '../cache';
import { compressForUpload } from './imageCompress';
import { clearPendingAnalysisJob, savePendingAnalysisJob } from '../pendingAnalysisStore';
import type { AnalysisStoreLocation } from '@/services/contracts/analysisStore';

type AnalysisStageCallback = (status: AnalysisJobStatus) => void;
type AnalysisJobPollingErrorCode = 'ANALYSIS_JOB_POLL_TIMEOUT' | 'ANALYSIS_JOB_POLL_STALE';

type SubmitAnalysisJobParams = {
  mode: AnalysisJobMode;
  imageUri: string;
  isoCountryCode: string;
  onUploadProgress?: (progress: number) => void;
};

type PollAnalysisJobParams = {
  jobId: string;
  requestId: string;
  submittedAt: string;
  onStageChange?: AnalysisStageCallback;
  isCancelled?: { current: boolean };
};

type RunAsyncAnalysisJobParams = {
  flow: 'camera' | 'scan';
  mode: AnalysisJobMode;
  imageUri: string;
  isoCountryCode: string;
  location: AnalysisStoreLocation | null;
  timestamp: string | null;
  sourceType: 'camera' | 'library';
  onUploadProgress?: (progress: number) => void;
  onStageChange?: AnalysisStageCallback;
  isCancelled?: { current: boolean };
};

type AnalysisJobSubmitResponse = ReturnType<typeof assertAnalysisJobSubmitContract>;
type AnalysisJobStatusResponse = ReturnType<typeof assertAnalysisJobStatusContract> & Record<string, unknown>;
type RetryableJobStatusError = Error & {
  retryAfterMs?: number;
  nonRetryable?: boolean;
};
type AnalysisJobPollingError = Error & {
  code: AnalysisJobPollingErrorCode;
  job_id: string;
  request_id: string;
  submitted_at: string;
  updated_at: string;
  elapsed_ms: number;
};

const ANALYSIS_JOB_POLL_MAX_DURATION_MS = 2 * 60 * 1000;
const ANALYSIS_JOB_STALE_TIMEOUT_MS = 90 * 1000;

const createRequestId = (mode: AnalysisJobMode): string => {
  const suffix = Math.random().toString(16).slice(2, 10);
  return `analyze-job-${mode}-${Date.now().toString(36)}-${suffix}`;
};

const getCacheEndpointPath = (mode: AnalysisJobMode): '/analyze' | '/analyze/label' | '/analyze/smart' => {
  if (mode === 'label') return '/analyze/label';
  if (mode === 'smart') return '/analyze/smart';
  return '/analyze';
};

const createPendingAnalysisJob = ({
  submit,
  params,
}: {
  submit: AnalysisJobSubmitResponse;
  params: RunAsyncAnalysisJobParams;
}): PendingAnalysisJob => {
  return {
    jobId: submit.job_id,
    requestId: submit.request_id,
    flow: params.flow,
    mode: params.mode,
    status: 'queued',
    imageUri: params.imageUri,
    isoCountryCode: params.isoCountryCode,
    location: params.location,
    timestamp: params.timestamp,
    sourceType: params.sourceType,
    submittedAt: submit.accepted_at,
  };
};

const getPollDelayMs = ({
  attempt,
  pollAfterMs,
}: {
  attempt: number;
  pollAfterMs: number;
}): number => {
  const stagedDelay = attempt < 5 ? 1000 : 2000;
  return Math.max(stagedDelay, pollAfterMs);
};

const parseTimestampMs = (timestamp: string): number => {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[AI Job] Invalid timestamp: ${timestamp}`);
  }
  return parsed;
};

const isTerminalAnalysisJobStatus = (status: AnalysisJobStatus): boolean =>
  status === 'completed' || status === 'fallback_completed' || status === 'failed';

const createAnalysisJobPollingError = ({
  code,
  jobId,
  requestId,
  submittedAt,
  updatedAt,
  elapsedMs,
}: {
  code: AnalysisJobPollingErrorCode;
  jobId: string;
  requestId: string;
  submittedAt: string;
  updatedAt: string;
  elapsedMs: number;
}): AnalysisJobPollingError => {
  const reason =
    code === 'ANALYSIS_JOB_POLL_TIMEOUT' ? 'polling timed out' : 'polling became stale';
  const error = new Error(
    `[AI Job] ${reason} job_id=${jobId} request_id=${requestId} submitted_at=${submittedAt} updated_at=${updatedAt} elapsed_ms=${elapsedMs}`
  ) as AnalysisJobPollingError;
  error.code = code;
  error.job_id = jobId;
  error.request_id = requestId;
  error.submitted_at = submittedAt;
  error.updated_at = updatedAt;
  error.elapsed_ms = elapsedMs;
  return error;
};

const fetchJsonWithTimeout = async ({
  url,
  headers,
  timeoutMs,
}: {
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const readRetryAfterMs = (response: Response): number | null => {
  const raw = response.headers.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds * 1000;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.message.includes('timed out'));

const buildJobStatusError = async (response: Response): Promise<RetryableJobStatusError> => {
  const bodyText = await response.text();
  const message = `[AI Job] ${response.status} ${bodyText}`.trim();
  const error = new Error(message) as RetryableJobStatusError;
  const retryAfterMs = readRetryAfterMs(response);
  if (retryAfterMs) {
    error.retryAfterMs = retryAfterMs;
  }
  if (response.status >= 400 && response.status < 500 && response.status !== 429) {
    error.nonRetryable = true;
  }
  return error;
};

const getRetryDelayMs = ({
  attempt,
  retryAfterMs,
}: {
  attempt: number;
  retryAfterMs?: number;
}): number => {
  if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
    return retryAfterMs;
  }
  return Math.pow(2, attempt - 1) * AI_RETRY_BASE_DELAY_MS;
};

const fetchJobStatusWithRetry = async ({
  url,
  headers,
  timeoutMs,
}: {
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<Response> => {
  let lastError: RetryableJobStatusError | null = null;

  for (let attempt = 1; attempt <= AI_REQUEST_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetchJsonWithTimeout({
        url,
        headers,
        timeoutMs,
      });

      if (response.ok) {
        return response;
      }

      throw await buildJobStatusError(response);
    } catch (error) {
      const normalizedError = (
        isAbortError(error)
          ? new Error(`[AI Job] status poll timed out after ${timeoutMs} ms`)
          : error instanceof Error
            ? error
            : new Error('Analysis job status request failed')
      ) as RetryableJobStatusError;

      lastError = normalizedError;

      if (normalizedError.nonRetryable || attempt === AI_REQUEST_MAX_RETRIES) {
        throw normalizedError;
      }

      await sleep(
        getRetryDelayMs({
          attempt,
          retryAfterMs: normalizedError.retryAfterMs,
        })
      );
    }
  }

  throw lastError || new Error('Analysis job status request failed');
};

const submitAnalysisJob = async ({
  mode,
  imageUri,
  isoCountryCode,
  onUploadProgress,
}: SubmitAnalysisJobParams): Promise<AnalysisJobSubmitResponse> => {
  const activeServerUrl = await ServerConfig.getServerUrl();
  const allergyString = await getAllergyString();
  const locale = await resolveRequestLocale();
  const compressedUri = await compressForUpload(imageUri);
  const requestId = createRequestId(mode);

  const uploadResult = await uploadWithRetryForAcceptedStatuses(
    `${activeServerUrl}/analyze/jobs`,
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
        mode,
      },
    },
    [202],
    AI_REQUEST_MAX_RETRIES,
    ANALYSIS_SUBMIT_TIMEOUT_MS,
    onUploadProgress,
  );

  return assertAnalysisJobSubmitContract(JSON.parse(uploadResult.body) as unknown);
};

const pollAnalysisJobUntilTerminal = async ({
  jobId,
  requestId,
  submittedAt,
  onStageChange,
  isCancelled,
}: PollAnalysisJobParams): Promise<AnalysisJobStatusResponse> => {
  const activeServerUrl = await ServerConfig.getServerUrl();
  const startedAtMs = Date.now();
  const submittedAtMs = parseTimestampMs(submittedAt);
  let lastProgressAtMs = startedAtMs;
  let lastUpdatedAtMs = submittedAtMs;
  let attempt = 0;

  while (true) {
    if (isCancelled?.current) {
      throw new Error('Analysis polling cancelled.');
    }

    const nowMs = Date.now();
    const pollElapsedMs = nowMs - startedAtMs;
    if (pollElapsedMs > ANALYSIS_JOB_POLL_MAX_DURATION_MS) {
      throw createAnalysisJobPollingError({
        code: 'ANALYSIS_JOB_POLL_TIMEOUT',
        jobId,
        requestId,
        submittedAt,
        updatedAt: new Date(lastUpdatedAtMs).toISOString(),
        elapsedMs: pollElapsedMs,
      });
    }

    if (nowMs - lastProgressAtMs > ANALYSIS_JOB_STALE_TIMEOUT_MS) {
      throw createAnalysisJobPollingError({
        code: 'ANALYSIS_JOB_POLL_STALE',
        jobId,
        requestId,
        submittedAt,
        updatedAt: new Date(lastUpdatedAtMs).toISOString(),
        elapsedMs: nowMs - lastProgressAtMs,
      });
    }

    const response = await fetchJobStatusWithRetry({
      url: `${activeServerUrl}/analyze/jobs/${jobId}`,
      headers: {
        'X-Request-Id': `${requestId}-poll-${attempt + 1}`,
        'X-Parent-Request-Id': requestId,
      },
      timeoutMs: ANALYSIS_POLL_TIMEOUT_MS,
    });

    const parsed = assertAnalysisJobStatusContract((await response.json()) as unknown) as AnalysisJobStatusResponse;
    onStageChange?.(parsed.status);

    if (isTerminalAnalysisJobStatus(parsed.status)) {
      return parsed;
    }

    const updatedAtMs = parseTimestampMs(parsed.updated_at);
    if (updatedAtMs > lastUpdatedAtMs) {
      lastUpdatedAtMs = updatedAtMs;
      lastProgressAtMs = nowMs;
    }

    const delayMs = getPollDelayMs({
      attempt,
      pollAfterMs: parsed.poll_after_ms,
    });
    attempt += 1;
    await sleep(delayMs);
  }
};

export const isAsyncAnalyzeEnabled = (): boolean => AI_ASYNC_ANALYZE_ENABLED;

export const runAsyncAnalysisJob = async (
  params: RunAsyncAnalysisJobParams
): Promise<AnalyzedData> => {
  const locale = await resolveRequestLocale();
  const allergyString = await getAllergyString();
  const imageHash = await buildImageContentHash(params.imageUri);
  const cacheKey = buildImageCacheKey({
    endpoint: getCacheEndpointPath(params.mode),
    imageHash,
    allergyInfo: allergyString,
    locale,
    isoCountryCode: params.isoCountryCode,
  });
  const cached = await getAiCacheValue<unknown>(cacheKey);
  if (cached) {
    return mapAnalyzedData(cached);
  }

  const submit = await submitAnalysisJob({
    mode: params.mode,
    imageUri: params.imageUri,
    isoCountryCode: params.isoCountryCode,
    onUploadProgress: params.onUploadProgress,
  });
  const pending = createPendingAnalysisJob({
    submit,
    params,
  });
  await savePendingAnalysisJob(pending);
  params.onStageChange?.('queued');

  try {
    const terminal = await pollAnalysisJobUntilTerminal({
      jobId: submit.job_id,
      requestId: submit.request_id,
      submittedAt: submit.accepted_at,
      onStageChange: asyncStatus => {
        if (params.isCancelled?.current) {
          return;
        }
        void savePendingAnalysisJob({
          ...pending,
          status: asyncStatus,
        });
        params.onStageChange?.(asyncStatus);
      },
      isCancelled: params.isCancelled,
    });

    if (terminal.status === 'failed') {
      const errorMessage =
        typeof terminal['error_message'] === 'string' && terminal['error_message'].length > 0
          ? terminal['error_message']
          : 'Analysis job failed.';
      throw new Error(errorMessage);
    }

    await clearPendingAnalysisJob();
    try {
      await setAiCacheValue(cacheKey, terminal);
    } catch (error) {
      logger.warn('[AI Job] Failed to write async analysis cache', {
        job_id: submit.job_id,
        request_id: submit.request_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return mapAnalyzedData(terminal);
  } catch (error) {
    await clearPendingAnalysisJob();
    throw error;
  }
};

export const resumePendingAnalysisJob = async ({
  pendingJob,
  onStageChange,
  isCancelled,
}: {
  pendingJob: PendingAnalysisJob;
  onStageChange?: AnalysisStageCallback;
  isCancelled?: { current: boolean };
}): Promise<AnalyzedData> => {
  logger.info('[AI Job] Resuming pending analysis job', {
    job_id: pendingJob.jobId,
    request_id: pendingJob.requestId,
    status: pendingJob.status,
  });
  try {
    const terminal = await pollAnalysisJobUntilTerminal({
      jobId: pendingJob.jobId,
      requestId: pendingJob.requestId,
      submittedAt: pendingJob.submittedAt,
      onStageChange: asyncStatus => {
        if (isCancelled?.current) {
          return;
        }
        void savePendingAnalysisJob({
          ...pendingJob,
          status: asyncStatus,
        });
        onStageChange?.(asyncStatus);
      },
      isCancelled,
    });
    if (terminal.status === 'failed') {
      const errorMessage =
        typeof terminal['error_message'] === 'string' && terminal['error_message'].length > 0
          ? terminal['error_message']
          : 'Analysis job failed.';
      throw new Error(errorMessage);
    }
    await clearPendingAnalysisJob();
    return mapAnalyzedData(terminal);
  } catch (error) {
    await clearPendingAnalysisJob();
    throw error;
  }
};
