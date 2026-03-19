import * as FileSystem from 'expo-file-system/legacy';

import {
  AI_ASYNC_ANALYZE_ENABLED,
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

type SubmitAnalysisJobParams = {
  mode: AnalysisJobMode;
  imageUri: string;
  isoCountryCode: string;
  onUploadProgress?: (progress: number) => void;
};

type PollAnalysisJobParams = {
  jobId: string;
  requestId: string;
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

const buildJobStatusError = async (response: Response): Promise<Error> => {
  const bodyText = await response.text();
  const message = `[AI Job] ${response.status} ${bodyText}`.trim();
  const error = new Error(message) as Error & { retryAfterMs?: number };
  const retryAfterMs = readRetryAfterMs(response);
  if (retryAfterMs) {
    error.retryAfterMs = retryAfterMs;
  }
  return error;
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
    3,
    ANALYSIS_SUBMIT_TIMEOUT_MS,
    onUploadProgress,
  );

  return assertAnalysisJobSubmitContract(JSON.parse(uploadResult.body) as unknown);
};

const pollAnalysisJobUntilTerminal = async ({
  jobId,
  requestId,
  onStageChange,
  isCancelled,
}: PollAnalysisJobParams): Promise<AnalysisJobStatusResponse> => {
  const activeServerUrl = await ServerConfig.getServerUrl();
  let attempt = 0;

  while (true) {
    if (isCancelled?.current) {
      throw new Error('Analysis polling cancelled.');
    }

    const response = await fetchJsonWithTimeout({
      url: `${activeServerUrl}/analyze/jobs/${jobId}`,
      headers: {
        'X-Request-Id': `${requestId}-poll-${attempt + 1}`,
        'X-Parent-Request-Id': requestId,
      },
      timeoutMs: ANALYSIS_POLL_TIMEOUT_MS,
    });

    if (!response.ok) {
      throw await buildJobStatusError(response);
    }

    const parsed = assertAnalysisJobStatusContract((await response.json()) as unknown) as AnalysisJobStatusResponse;
    onStageChange?.(parsed.status);

    if (
      parsed.status === 'completed' ||
      parsed.status === 'fallback_completed' ||
      parsed.status === 'failed'
    ) {
      return parsed;
    }

    const delayMs = getPollDelayMs({
      attempt,
      pollAfterMs: parsed.poll_after_ms,
    });
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
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

  const terminal = await pollAnalysisJobUntilTerminal({
    jobId: submit.job_id,
    requestId: submit.request_id,
    onStageChange: asyncStatus => {
      void savePendingAnalysisJob({
        ...pending,
        status: asyncStatus,
      });
      params.onStageChange?.(asyncStatus);
    },
    isCancelled: params.isCancelled,
  });

  if (terminal.status === 'failed') {
    await clearPendingAnalysisJob();
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
  const terminal = await pollAnalysisJobUntilTerminal({
    jobId: pendingJob.jobId,
    requestId: pendingJob.requestId,
    onStageChange: asyncStatus => {
      void savePendingAnalysisJob({
        ...pendingJob,
        status: asyncStatus,
      });
      onStageChange?.(asyncStatus);
    },
    isCancelled,
  });
  if (terminal.status === 'failed') {
    await clearPendingAnalysisJob();
    const errorMessage =
      typeof terminal['error_message'] === 'string' && terminal['error_message'].length > 0
        ? terminal['error_message']
        : 'Analysis job failed.';
    throw new Error(errorMessage);
  }
  await clearPendingAnalysisJob();
  return mapAnalyzedData(terminal);
};
