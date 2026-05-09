import { lookupBarcodeWithAllergyContext } from '../internal/barcodeLookup';

jest.mock('@/features/i18n/services/i18nStore', () => ({
  getI18nSnapshot: jest.fn(() => ({
    settings: { language: 'auto', targetLanguage: null },
    locale: 'ko-KR',
    ready: true,
  })),
}));

jest.mock('../allergy', () => ({
  getAllergyString: jest.fn(async () => 'None'),
}));

jest.mock('../serverConfig', () => ({
  ServerConfig: {
    getServerUrl: jest.fn(async () => 'https://example.com'),
  },
}));

jest.mock('../internal/requestLocale', () => ({
  resolveRequestLocale: jest.fn(async () => 'ko-KR'),
}));

jest.mock('../internal/retryUtils', () => ({
  sleep: jest.fn(async () => undefined),
}));

jest.mock('../cache', () => ({
  buildBarcodeCacheKey: jest.fn(() => 'cache-key'),
  getAiCacheValue: jest.fn(async () => null),
  setAiCacheValue: jest.fn(async () => undefined),
}));

jest.mock('../constants', () => ({
  AI_RETRY_BASE_DELAY_MS: 1000,
  BARCODE_LOOKUP_MAX_RETRIES: 3,
  BARCODE_LOOKUP_TIMEOUT_MS: 15000,
}));

type MockResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
};

const response = (
  status: number,
  payload: unknown,
  headerMap: Record<string, string> = {}
): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name: string) => headerMap[name] ?? null,
  },
  json: async () => payload,
});

describe('lookupBarcodeWithAllergyContext request ids', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses unique attempt request ids and stable parent request id across retries', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        response(503, { detail: { message: 'temporary fail', code: 'UPSTREAM_TEMP_FAIL' } })
      )
      .mockResolvedValueOnce(response(200, { found: false, message: 'ok' }));

    global.fetch = fetchMock as unknown as typeof fetch;

    await lookupBarcodeWithAllergyContext('8801043015981');

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const secondHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;

    expect(firstHeaders['X-Parent-Request-Id']).toBeDefined();
    expect(firstHeaders['X-Parent-Request-Id']).toBe(secondHeaders['X-Parent-Request-Id']);
    expect(firstHeaders['X-Request-Id']).toBeDefined();
    expect(secondHeaders['X-Request-Id']).toBeDefined();
    expect(firstHeaders['X-Request-Id']).not.toBe(secondHeaders['X-Request-Id']);
  });

  it('deduplicates concurrent lookup calls with the same cache key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(200, { found: false, message: 'ok' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const [resultA, resultB] = await Promise.all([
      lookupBarcodeWithAllergyContext('8801043015981'),
      lookupBarcodeWithAllergyContext('8801043015981'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultA.found).toBe(false);
    expect(resultB.found).toBe(false);
  });

  it('propagates request_id into mapped barcode data', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      response(200, {
        found: true,
        request_id: 'req-barcode-1',
        used_model: 'gemini-2.5-pro',
        prompt_version: 'barcode-v1.1-allergen-compact',
        latency_ms: {
          total: 320,
          source_lookup: 180,
        },
        data: {
          food_name: 'Protein Bar',
          safetyStatus: 'SAFE',
          ingredients: [],
          latency_ms_by_stage: {
            total: 320,
          },
        },
      })
    ) as unknown as typeof fetch;

    const result = await lookupBarcodeWithAllergyContext('8801043015981');

    expect(result.request_id).toBe('req-barcode-1');
    expect(result.data?.request_id).toBe('req-barcode-1');
    expect(result.data?.used_model).toBe('gemini-2.5-pro');
    expect(result.data?.prompt_version).toBe('barcode-v1.1-allergen-compact');
    expect(result.data?.latency_ms).toEqual({
      total: 320,
      source_lookup: 180,
    });
    expect(result.data?.latency_ms_by_stage).toEqual({
      total: 320,
    });
  });
});
