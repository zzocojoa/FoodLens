import { lookupBarcodeWithAllergyContext } from '../internal/barcodeLookup';

jest.mock('../allergy_Logic', () => ({
  getAllergyString: jest.fn(async () => 'None'),
}));

jest.mock('../serverConfig_Logic', () => ({
  ServerConfig: {
    getServerUrl: jest.fn(async () => 'https://example.com'),
  },
}));

jest.mock('../internal/requestLocale_Logic', () => ({
  resolveRequestLocale: jest.fn(async () => 'ko-KR'),
}));

jest.mock('../internal/retryUtils_Logic', () => ({
  sleep: jest.fn(async () => undefined),
}));

jest.mock('../cache_Logic', () => ({
  buildBarcodeCacheKey: jest.fn(() => 'cache-key'),
  getAiCacheValue: jest.fn(async () => null),
  setAiCacheValue: jest.fn(async () => undefined),
}));

jest.mock('../constants_Logic', () => ({
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
});
