import { resumePendingAnalysisJob, runAsyncAnalysisJob } from '../internal/analysisJobs';
import type { AnalysisJobStatus } from '../types';

jest.mock('../upload', () => ({
  uploadWithRetryForAcceptedStatuses: jest.fn(),
}));

jest.mock('../constants', () => ({
  AI_ASYNC_ANALYZE_ENABLED: true,
  AI_REQUEST_MAX_RETRIES: 3,
  AI_RETRY_BASE_DELAY_MS: 1000,
  ANALYSIS_POLL_TIMEOUT_MS: 15000,
  ANALYSIS_SUBMIT_TIMEOUT_MS: 15000,
  getAiUserId: jest.fn(() => 'user-1'),
}));

jest.mock('../serverConfig', () => ({
  ServerConfig: {
    getServerUrl: jest.fn(async () => 'https://api.example.com'),
  },
}));

jest.mock('../allergy', () => ({
  getAllergyString: jest.fn(async () => 'peanut'),
}));

jest.mock('../cache', () => ({
  buildImageCacheKey: jest.fn(() => 'cache-key'),
  buildImageContentHash: jest.fn(async () => 'image-hash'),
  getAiCacheValue: jest.fn(async () => null),
  setAiCacheValue: jest.fn(async () => undefined),
}));

jest.mock('../mappers', () => ({
  mapAnalyzedData: jest.fn((value: unknown) => {
    if (!value || typeof value !== 'object') {
      return value;
    }

    const payload = value as Record<string, unknown>;

    return {
      ...payload,
      decisionStatus: payload['decision_status'],
      analysisOrigin: payload['analysis_origin'],
      recommendedAction: payload['recommended_action'],
      uncertaintyReason: payload['uncertainty_reason'],
      decisionConfidence: payload['decision_confidence'],
    };
  }),
}));

jest.mock('./../pendingAnalysisStore', () => ({
  savePendingAnalysisJob: jest.fn(async () => undefined),
  clearPendingAnalysisJob: jest.fn(async () => undefined),
}));

jest.mock('../internal/requestLocale', () => ({
  resolveRequestLocale: jest.fn(async () => 'en-US'),
}));

jest.mock('../internal/imageCompress', () => ({
  compressForUpload: jest.fn(async (value: string) => value),
}));

jest.mock('../internal/retryUtils', () => ({
  sleep: jest.fn(async () => undefined),
}));

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: {
    get: (name: string) => string | null;
  };
};

const uploadModule = jest.requireMock('../upload') as {
  uploadWithRetryForAcceptedStatuses: jest.Mock;
};

const cacheModule = jest.requireMock('../cache') as {
  setAiCacheValue: jest.Mock;
};

const pendingStoreModule = jest.requireMock('./../pendingAnalysisStore') as {
  savePendingAnalysisJob: jest.Mock;
  clearPendingAnalysisJob: jest.Mock;
};

const retryUtilsModule = jest.requireMock('../internal/retryUtils') as {
  sleep: jest.Mock;
};

const createMockResponse = ({
  status,
  body,
  retryAfter,
}: {
  status: number;
  body: unknown;
  retryAfter?: string | null;
}): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: {
    get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null),
  },
});

describe('analysisJobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('submits and polls until completion', async () => {
    uploadModule.uploadWithRetryForAcceptedStatuses.mockResolvedValue({
      status: 202,
      body: JSON.stringify({
        job_id: 'job_123',
        request_id: 'req_123',
        status: 'queued',
        accepted_at: '2026-03-17T00:00:00Z',
        poll_after_ms: 1000,
      }),
    });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_123',
          request_id: 'req_123',
          status: 'queued',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:01Z',
          poll_after_ms: 0,
        },
      }) as unknown as Response
    ).mockResolvedValueOnce(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_123',
          request_id: 'req_123',
          status: 'completed',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:02Z',
          poll_after_ms: 0,
          foodName: 'Bibimbap',
          foodName_en: 'Bibimbap',
          foodName_ko: '비빔밥',
          safetyStatus: 'SAFE',
          decision_status: 'OK',
          analysis_origin: 'food_photo',
          recommended_action: 'eat',
          uncertainty_reason: 'unknown',
          ingredients: [],
        },
      }) as unknown as Response
    );

    const statuses: string[] = [];
    const result = await runAsyncAnalysisJob({
      flow: 'camera',
      mode: 'food',
      imageUri: 'file://food.jpg',
      isoCountryCode: 'KR',
      location: null,
      timestamp: '2026-03-17T00:00:00Z',
      sourceType: 'camera',
      onStageChange: (status) => statuses.push(status),
    });

    expect(result.foodName).toBe('Bibimbap');
    expect(result.foodName_en).toBe('Bibimbap');
    expect(result.foodName_ko).toBe('비빔밥');
    expect(result.request_id).toBe('req_123');
    expect(result.decisionStatus).toBe('OK');
    expect(result.analysisOrigin).toBe('food_photo');
    expect(result.recommendedAction).toBe('eat');
    expect(result.uncertaintyReason).toBe('unknown');
    expect(statuses).toEqual(['queued', 'queued', 'completed']);
    expect(pendingStoreModule.savePendingAnalysisJob).toHaveBeenCalled();
    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(cacheModule.setAiCacheValue).toHaveBeenCalledTimes(1);
  });

  it('throws when terminal status is failed', async () => {
    uploadModule.uploadWithRetryForAcceptedStatuses.mockResolvedValue({
      status: 202,
      body: JSON.stringify({
        job_id: 'job_123',
        request_id: 'req_123',
        status: 'queued',
        accepted_at: '2026-03-17T00:00:00Z',
        poll_after_ms: 1000,
      }),
    });

    jest.spyOn(global, 'fetch').mockResolvedValue(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_123',
          request_id: 'req_123',
          status: 'failed',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:02Z',
          poll_after_ms: 0,
          error_message: 'job failed',
        },
      }) as unknown as Response
    );

    await expect(
      runAsyncAnalysisJob({
        flow: 'camera',
        mode: 'food',
        imageUri: 'file://food.jpg',
        isoCountryCode: 'KR',
        location: null,
        timestamp: null,
        sourceType: 'camera',
      })
    ).rejects.toThrow('job failed');

    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
  });

  it('submits and polls label async jobs until completion', async () => {
    uploadModule.uploadWithRetryForAcceptedStatuses.mockResolvedValue({
      status: 202,
      body: JSON.stringify({
        job_id: 'job_label_123',
        request_id: 'req_label_123',
        status: 'queued',
        accepted_at: '2026-03-17T00:00:00Z',
        poll_after_ms: 1000,
      }),
    });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_label_123',
          request_id: 'req_label_123',
          status: 'queued',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:01Z',
          poll_after_ms: 0,
        },
      }) as unknown as Response
    ).mockResolvedValueOnce(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_label_123',
          request_id: 'req_label_123',
          status: 'completed',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:02Z',
          poll_after_ms: 0,
          foodName: 'Milk',
          foodName_en: 'Milk',
          foodName_ko: '우유',
          safetyStatus: 'CAUTION',
          decision_status: 'ASK',
          analysis_origin: 'label_photo',
          recommended_action: 'verify_label',
          uncertainty_reason: 'missing_label_text',
          ingredients: [],
        },
      }) as unknown as Response
    );

    const statuses: AnalysisJobStatus[] = [];
    const result = await runAsyncAnalysisJob({
      flow: 'camera',
      mode: 'label',
      imageUri: 'file://label.jpg',
      isoCountryCode: 'KR',
      location: null,
      timestamp: '2026-03-17T00:00:00Z',
      sourceType: 'camera',
      onStageChange: status => statuses.push(status),
    });

    expect(result.foodName).toBe('Milk');
    expect(result.foodName_en).toBe('Milk');
    expect(result.foodName_ko).toBe('우유');
    expect(result.request_id).toBe('req_label_123');
    expect(result.decisionStatus).toBe('ASK');
    expect(result.analysisOrigin).toBe('label_photo');
    expect(result.recommendedAction).toBe('verify_label');
    expect(result.uncertaintyReason).toBe('missing_label_text');
    expect(statuses).toEqual(['queued', 'queued', 'completed']);
    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(cacheModule.setAiCacheValue).toHaveBeenCalledTimes(1);
  });

  it('clears pending jobs when polling is cancelled during resume', async () => {
    const isCancelled = { current: true };

    await expect(
      resumePendingAnalysisJob({
        pendingJob: {
          jobId: 'job_cancelled',
          requestId: 'req_cancelled',
          flow: 'scan',
          mode: 'food',
          status: 'queued',
          imageUri: 'file://food.jpg',
          isoCountryCode: 'US',
          location: null,
          timestamp: null,
          sourceType: 'camera',
          submittedAt: '2026-03-17T00:00:00Z',
        },
        isCancelled,
      })
    ).rejects.toThrow('Analysis polling cancelled.');

    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('clears pending jobs when polling retries exhaust after repeated server errors', async () => {
    uploadModule.uploadWithRetryForAcceptedStatuses.mockResolvedValue({
      status: 202,
      body: JSON.stringify({
        job_id: 'job_retry_exhausted',
        request_id: 'req_retry_exhausted',
        status: 'queued',
        accepted_at: '2026-03-17T00:00:00Z',
        poll_after_ms: 1000,
      }),
    });

    jest.spyOn(global, 'fetch').mockResolvedValue(
      createMockResponse({
        status: 500,
        body: {
          detail: 'upstream failure',
        },
      }) as unknown as Response
    );

    await expect(
      runAsyncAnalysisJob({
        flow: 'camera',
        mode: 'food',
        imageUri: 'file://food.jpg',
        isoCountryCode: 'KR',
        location: null,
        timestamp: null,
        sourceType: 'camera',
      })
    ).rejects.toThrow('[AI Job] 500');

    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('throws when a resumed label job ends in failed terminal status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_label_failed',
          request_id: 'req_label_failed',
          status: 'failed',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:02Z',
          poll_after_ms: 0,
          error_message: 'label job failed',
        },
      }) as unknown as Response
    );

    await expect(
      resumePendingAnalysisJob({
        pendingJob: {
          jobId: 'job_label_failed',
          requestId: 'req_label_failed',
          flow: 'scan',
          mode: 'label',
          status: 'queued',
          imageUri: 'file://label.jpg',
          isoCountryCode: 'US',
          location: null,
          timestamp: null,
          sourceType: 'camera',
          submittedAt: '2026-03-17T00:00:00Z',
        },
      })
    ).rejects.toThrow('label job failed');

    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('resumes a pending job and maps terminal result', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_resume',
          request_id: 'req_resume',
          status: 'completed',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:02Z',
          poll_after_ms: 0,
          foodName: 'Salad',
          foodName_en: 'Salad',
          foodName_ko: '샐러드',
          safetyStatus: 'SAFE',
          decision_status: 'OK',
          analysis_origin: 'food_photo',
          recommended_action: 'eat',
          uncertainty_reason: 'unknown',
          ingredients: [],
        },
      }) as unknown as Response
    );

    const result = await resumePendingAnalysisJob({
      pendingJob: {
        jobId: 'job_resume',
        requestId: 'req_resume',
        flow: 'scan',
        mode: 'food',
        status: 'queued',
        imageUri: 'file://food.jpg',
        isoCountryCode: 'US',
        location: null,
        timestamp: null,
        sourceType: 'camera',
        submittedAt: '2026-03-17T00:00:00Z',
      },
    });

    expect(result.foodName).toBe('Salad');
    expect(result.foodName_en).toBe('Salad');
    expect(result.foodName_ko).toBe('샐러드');
    expect(result.request_id).toBe('req_resume');
    expect(result.decisionStatus).toBe('OK');
    expect(result.analysisOrigin).toBe('food_photo');
    expect(result.recommendedAction).toBe('eat');
    expect(result.uncertaintyReason).toBe('unknown');
    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
  });

  it('treats fallback_completed as a terminal success status', async () => {
    uploadModule.uploadWithRetryForAcceptedStatuses.mockResolvedValue({
      status: 202,
      body: JSON.stringify({
        job_id: 'job_fallback',
        request_id: 'req_fallback',
        status: 'queued',
        accepted_at: '2026-03-17T00:00:00Z',
        poll_after_ms: 1000,
      }),
    });

    jest.spyOn(global, 'fetch').mockResolvedValue(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_fallback',
          request_id: 'req_fallback',
          status: 'fallback_completed',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:02Z',
          poll_after_ms: 0,
          foodName: 'Soup',
          safetyStatus: 'CAUTION',
          decision_status: 'ASK',
          analysis_origin: 'label_photo',
          recommended_action: 'verify_label',
          uncertainty_reason: 'missing_label_text',
          ingredients: [],
          fallback_reason: 'nutrition_unavailable',
        },
      }) as unknown as Response
    );

    const result = await runAsyncAnalysisJob({
      flow: 'camera',
      mode: 'food',
      imageUri: 'file://food.jpg',
      isoCountryCode: 'KR',
      location: null,
      timestamp: null,
      sourceType: 'camera',
    });

    expect(result.foodName).toBe('Soup');
    expect(result.decisionStatus).toBe('ASK');
    expect(result.analysisOrigin).toBe('label_photo');
    expect(result.recommendedAction).toBe('verify_label');
    expect(result.uncertaintyReason).toBe('missing_label_text');
    expect(result.fallback_reason).toBe('nutrition_unavailable');
    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
  });

  it('times out and clears pending job when polling never reaches a terminal state', async () => {
    uploadModule.uploadWithRetryForAcceptedStatuses.mockResolvedValue({
      status: 202,
      body: JSON.stringify({
        job_id: 'job_timeout',
        request_id: 'req_timeout',
        status: 'queued',
        accepted_at: '2026-03-17T00:00:00Z',
        poll_after_ms: 1000,
      }),
    });

    let nowMs = Date.parse('2026-03-17T00:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      nowMs += 75000;
      return createMockResponse({
        status: 200,
        body: {
          job_id: 'job_timeout',
          request_id: 'req_timeout',
          status: 'queued',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: new Date(nowMs).toISOString(),
          poll_after_ms: 0,
        },
      }) as unknown as Response;
    });

    await expect(
      runAsyncAnalysisJob({
        flow: 'camera',
        mode: 'food',
        imageUri: 'file://food.jpg',
        isoCountryCode: 'KR',
        location: null,
        timestamp: null,
        sourceType: 'camera',
      })
    ).rejects.toMatchObject({
      code: 'ANALYSIS_JOB_POLL_TIMEOUT',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
  });

  it('treats a non-progressing resumed job as stale and clears the pending entry', async () => {
    let nowMs = Date.parse('2026-03-17T00:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      nowMs += 60000;
      return createMockResponse({
        status: 200,
        body: {
          job_id: 'job_stale',
          request_id: 'req_stale',
          status: 'queued',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:00Z',
          poll_after_ms: 0,
        },
      }) as unknown as Response;
    });

    await expect(
      resumePendingAnalysisJob({
        pendingJob: {
          jobId: 'job_stale',
          requestId: 'req_stale',
          flow: 'scan',
          mode: 'food',
          status: 'queued',
          imageUri: 'file://food.jpg',
          isoCountryCode: 'US',
          location: null,
          timestamp: null,
          sourceType: 'camera',
          submittedAt: '2026-03-17T00:00:00Z',
        },
      })
    ).rejects.toMatchObject({
      code: 'ANALYSIS_JOB_POLL_STALE',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(pendingStoreModule.clearPendingAnalysisJob).toHaveBeenCalledTimes(1);
  });

  it('retries poll requests after 429 using Retry-After', async () => {
    uploadModule.uploadWithRetryForAcceptedStatuses.mockResolvedValue({
      status: 202,
      body: JSON.stringify({
        job_id: 'job_retry',
        request_id: 'req_retry',
        status: 'queued',
        accepted_at: '2026-03-17T00:00:00Z',
        poll_after_ms: 1000,
      }),
    });

    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      createMockResponse({
        status: 429,
        body: {
          detail: {
            message: 'rate limited',
            code: 'UPSTREAM_RATE_LIMITED',
            request_id: 'req_retry',
            retry_after_seconds: 2,
          },
        },
        retryAfter: '2',
      }) as unknown as Response
    ).mockResolvedValueOnce(
      createMockResponse({
        status: 200,
        body: {
          job_id: 'job_retry',
          request_id: 'req_retry',
          status: 'completed',
          accepted_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:02Z',
          poll_after_ms: 0,
          foodName: 'Toast',
          safetyStatus: 'SAFE',
          ingredients: [],
        },
      }) as unknown as Response
    );

    const result = await runAsyncAnalysisJob({
      flow: 'camera',
      mode: 'food',
      imageUri: 'file://food.jpg',
      isoCountryCode: 'KR',
      location: null,
      timestamp: null,
      sourceType: 'camera',
    });

    expect(result.foodName).toBe('Toast');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(retryUtilsModule.sleep).toHaveBeenCalledWith(2000);
  });
});
