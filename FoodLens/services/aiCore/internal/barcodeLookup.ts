import { getAllergyString } from '../allergy_Logic';
import { mapBarcodeToAnalyzedData } from '../mappers_Logic';
import { ServerConfig } from '../serverConfig_Logic';
import { BarcodeLookupResult } from '../types';
import { resolveRequestLocale } from './requestLocale_Logic';
import { assertBarcodeLookupContract } from '../contracts_Logic';
import { sleep } from './retryUtils_Logic';
import { BARCODE_LOOKUP_MAX_RETRIES, BARCODE_LOOKUP_TIMEOUT_MS } from '../constants_Logic';
import { buildBarcodeCacheKey, getAiCacheValue, setAiCacheValue } from '../cache_Logic';

const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.message.includes('timed out'));

const TRACE_TAG = '[AI][BarcodeLookup]';

const maskBarcode = (barcode: string): string => {
  if (!barcode) return 'unknown';
  if (barcode.length <= 4) return barcode;
  return `***${barcode.slice(-4)}`;
};

const extractHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
};

type ParsedErrorDetail = {
  message?: string;
  code?: string;
  request_id?: string;
  retry_after_seconds?: number;
};

const parseRetryAfterSeconds = (response: Response, detail?: ParsedErrorDetail): number | null => {
  const headerValue = response.headers.get('Retry-After');
  if (headerValue) {
    const parsedHeader = Number(headerValue);
    if (Number.isFinite(parsedHeader) && parsedHeader > 0) return parsedHeader;
  }
  const fromDetail = detail?.retry_after_seconds;
  if (typeof fromDetail === 'number' && Number.isFinite(fromDetail) && fromDetail > 0) {
    return fromDetail;
  }
  return null;
};

const parseErrorDetail = async (response: Response): Promise<ParsedErrorDetail | undefined> => {
  try {
    const payload = (await response.json()) as { detail?: ParsedErrorDetail } | ParsedErrorDetail;
    const detail = (payload as { detail?: ParsedErrorDetail }).detail ?? (payload as ParsedErrorDetail);
    if (detail && typeof detail === 'object') return detail;
  } catch {
    // Ignore parse failures and rely on status code.
  }
  return undefined;
};

const createRequestId = (): string => {
  const rand = Math.random().toString(16).slice(2, 10);
  return `bc-${Date.now().toString(36)}-${rand}`;
};

const fetchBarcodeWithTimeout = async (
  url: string,
  formData: FormData,
  timeoutMs: number,
  meta: { attempt: number; barcode: string; requestId: string }
): Promise<Response> => {
  const controller = new AbortController();
  const startedAt = Date.now();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  try {
    console.log(`${TRACE_TAG} request:start`, {
      attempt: meta.attempt,
      barcode: maskBarcode(meta.barcode),
      requestId: meta.requestId,
      timeoutMs,
    });
    return await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      headers: {
        'X-Request-Id': meta.requestId,
      },
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    console.warn(`${TRACE_TAG} request:error`, {
      attempt: meta.attempt,
      barcode: maskBarcode(meta.barcode),
      requestId: meta.requestId,
      elapsedMs,
      didTimeout,
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
    });
    if (isAbortError(error)) {
      throw new Error(`Barcode lookup timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const lookupBarcodeWithAllergyContext = async (
  barcode: string,
): Promise<BarcodeLookupResult> => {
  const activeServerUrl = await ServerConfig.getServerUrl();
  const allergyString = await getAllergyString();
  const locale = await resolveRequestLocale();
  const requestId = createRequestId();
  const maskedBarcode = maskBarcode(barcode);
  const cacheKey = buildBarcodeCacheKey({
    barcode,
    allergyInfo: allergyString,
    locale,
  });

  const cached = await getAiCacheValue<BarcodeLookupResult>(cacheKey);
  if (cached) {
    console.log(`${TRACE_TAG} cache_hit=true`, {
      barcode: maskedBarcode,
      requestId,
    });
    return cached;
  }

  const formData = new FormData();
  formData.append('barcode', barcode);
  formData.append('allergy_info', allergyString);
  formData.append('locale', locale);

  const url = `${activeServerUrl}/lookup/barcode`;
  let lastError: Error | null = null;

  console.log(`${TRACE_TAG} lookup:init`, {
    barcode: maskedBarcode,
    locale,
    serverHost: extractHost(activeServerUrl),
    requestId,
    timeoutMs: BARCODE_LOOKUP_TIMEOUT_MS,
    maxRetries: BARCODE_LOOKUP_MAX_RETRIES,
    allergyItemCount: allergyString === 'None' ? 0 : allergyString.split(',').map((v) => v.trim()).filter(Boolean).length,
  });

  for (let attempt = 1; attempt <= BARCODE_LOOKUP_MAX_RETRIES; attempt++) {
    const attemptStartedAt = Date.now();
    try {
      const response = await fetchBarcodeWithTimeout(url, formData, BARCODE_LOOKUP_TIMEOUT_MS, {
        attempt,
        barcode,
        requestId,
      });
      const elapsedMs = Date.now() - attemptStartedAt;
      console.log(`${TRACE_TAG} request:response`, {
        attempt,
        barcode: maskedBarcode,
        requestId,
        status: response.status,
        ok: response.ok,
        elapsedMs,
      });

      if (!response.ok) {
        const detail = await parseErrorDetail(response);
        const retryAfterSeconds = parseRetryAfterSeconds(response, detail);

        if (response.status >= 400 && response.status < 500 && !isRetryableStatus(response.status)) {
          console.warn(`${TRACE_TAG} request:non-retryable-status`, {
            attempt,
            barcode: maskedBarcode,
            requestId,
            status: response.status,
            code: detail?.code,
            upstreamRequestId: detail?.request_id,
          });
          throw new Error(
            `Barcode lookup rejected (${response.status})` +
              `${detail?.code ? ` code=${detail.code}` : ''}` +
              `${detail?.request_id ? ` request_id=${detail.request_id}` : ''}`
          );
        }

        console.warn(`${TRACE_TAG} request:retryable-status`, {
          attempt,
          barcode: maskedBarcode,
          requestId,
          status: response.status,
          code: detail?.code,
          upstreamRequestId: detail?.request_id,
          retryAfterSeconds,
        });
        const retryableError = new Error(
          `Barcode lookup failed with status ${response.status}` +
            `${detail?.code ? ` code=${detail.code}` : ''}` +
            `${detail?.request_id ? ` request_id=${detail.request_id}` : ''}`
        ) as Error & { retryAfterMs?: number };
        if (retryAfterSeconds && retryAfterSeconds > 0) {
          retryableError.retryAfterMs = retryAfterSeconds * 1000;
        }
        throw retryableError;
      }

      const result = assertBarcodeLookupContract(await response.json());
      if (result.found && result.data) {
        result.data = mapBarcodeToAnalyzedData(result.data);
        result.data.isBarcode = true;
      }
      await setAiCacheValue(cacheKey, result);

      console.log(`${TRACE_TAG} lookup:success`, {
        attempt,
        barcode: maskedBarcode,
        requestId,
        found: result.found,
      });
      return result;
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error('Barcode lookup failed due to unknown error');
      lastError = normalizedError;
      const elapsedMs = Date.now() - attemptStartedAt;
      console.warn(`${TRACE_TAG} lookup:attempt-failed`, {
        attempt,
        barcode: maskedBarcode,
        requestId,
        elapsedMs,
        name: normalizedError.name,
        message: normalizedError.message,
      });

      const isLastAttempt = attempt === BARCODE_LOOKUP_MAX_RETRIES;
      if (isLastAttempt) break;

      const retryAfterMs =
        normalizedError &&
        typeof (normalizedError as Error & { retryAfterMs?: number }).retryAfterMs === 'number'
          ? (normalizedError as Error & { retryAfterMs?: number }).retryAfterMs
          : undefined;
      const delayMs = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : Math.pow(2, attempt - 1) * 500;
      console.log(`${TRACE_TAG} lookup:retry-scheduled`, {
        attempt,
        barcode: maskedBarcode,
        requestId,
        nextAttempt: attempt + 1,
        delayMs,
      });
      await sleep(delayMs);
    }
  }

  if (lastError && isAbortError(lastError)) {
    throw new Error('Barcode lookup timed out. Please try again.');
  }
  throw lastError || new Error('Barcode lookup failed. Please try again.');
};
