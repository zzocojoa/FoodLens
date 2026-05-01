import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || '').replace(/\/+$/, '');
const mediaRenderUrl = (__ENV.MEDIA_RENDER_URL || '').trim();
const mediaRenderCacheHitUrl = (__ENV.MEDIA_RENDER_CACHE_HIT_URL || '').trim();
const mediaRenderCacheMissUrlsPath = (__ENV.MEDIA_RENDER_CACHE_MISS_URLS_PATH || '').trim();
const authBearerToken = (__ENV.AUTH_BEARER_TOKEN || '').trim();
const enableAnalyzeRaw = (__ENV.ENABLE_ANALYZE || '0').trim();
const enableAnalyze = enableAnalyzeRaw === '1';
const analyzePath = (__ENV.ANALYZE_PATH || '').trim();
const analyzeLocale = (__ENV.ANALYZE_LOCALE || 'ko-KR').trim();
const analyzeAllergy = (__ENV.ANALYZE_ALLERGY || 'egg').trim();
const thinkTimeMs = Number(__ENV.THINK_TIME_MS || '200');
const analyzeEvery = Number(__ENV.ANALYZE_EVERY || '10');
const renderCacheMissEvery = Number(__ENV.RENDER_CACHE_MISS_EVERY || '1');
const minRenderCacheMissSamples = Number(__ENV.MIN_RENDER_CACHE_MISS_SAMPLES || '15');
const renderCacheMissP95HardThresholdMs = Number(__ENV.RENDER_CACHE_MISS_P95_HARD_THRESHOLD_MS || '3000');
const requireMediaRenderCacheHeader = (__ENV.REQUIRE_MEDIA_RENDER_CACHE_HEADER || '0').trim() === '1';
const requireProfileAuthSuccess = (__ENV.REQUIRE_PROFILE_AUTH_SUCCESS || '0').trim() === '1';

function parseUrlList(raw) {
  return String(raw || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

const mediaRenderCacheMissUrls = parseUrlList(
  mediaRenderCacheMissUrlsPath
    ? open(mediaRenderCacheMissUrlsPath)
    : (__ENV.MEDIA_RENDER_CACHE_MISS_URLS || __ENV.MEDIA_RENDER_CACHE_MISS_URL || ''),
);

if (!mediaRenderUrl) {
  throw new Error('MEDIA_RENDER_URL is required.');
}
if (enableAnalyzeRaw !== '0' && enableAnalyzeRaw !== '1') {
  throw new Error('ENABLE_ANALYZE must be 0 or 1.');
}
if (!isSignedMediaRenderUrl(mediaRenderUrl)) {
  throw new Error('MEDIA_RENDER_URL must be an http(s) signed /media/render URL with exp and sig query params.');
}
if (mediaRenderCacheHitUrl && !isSignedMediaRenderUrl(mediaRenderCacheHitUrl)) {
  throw new Error('MEDIA_RENDER_CACHE_HIT_URL must be an http(s) signed /media/render URL with exp and sig query params.');
}
if (mediaRenderCacheMissUrls.some((url) => !isSignedMediaRenderUrl(url))) {
  throw new Error('MEDIA_RENDER_CACHE_MISS_URLS must contain only http(s) signed /media/render URLs with exp and sig query params.');
}
if (mediaRenderCacheMissUrls.length > 0 && !isPositiveInteger(renderCacheMissEvery)) {
  throw new Error('RENDER_CACHE_MISS_EVERY must be a positive integer when cache-miss URLs are configured.');
}
if (mediaRenderCacheMissUrls.length > 0 && !isPositiveInteger(minRenderCacheMissSamples)) {
  throw new Error('MIN_RENDER_CACHE_MISS_SAMPLES must be a positive integer when cache-miss URLs are configured.');
}
if (mediaRenderCacheMissUrls.length > 0 && !isPositiveInteger(renderCacheMissP95HardThresholdMs)) {
  throw new Error('RENDER_CACHE_MISS_P95_HARD_THRESHOLD_MS must be a positive integer when cache-miss URLs are configured.');
}
if ((authBearerToken || enableAnalyze) && !baseUrl) {
  throw new Error('BASE_URL is required when AUTH_BEARER_TOKEN is set or ENABLE_ANALYZE=1.');
}
if (!Number.isFinite(thinkTimeMs)) {
  throw new Error('THINK_TIME_MS must be numeric.');
}

let analyzeBinary = null;
if (enableAnalyze) {
  if (!analyzePath) {
    throw new Error('ANALYZE_PATH is required when ENABLE_ANALYZE=1.');
  }
  if (!isPositiveInteger(analyzeEvery)) {
    throw new Error('ANALYZE_EVERY must be a positive integer when ENABLE_ANALYZE=1.');
  }
  analyzeBinary = open(analyzePath, 'b');
}

const renderFailureRate = new Rate('render_failure_rate');
const renderStatus2xxRate = new Rate('render_status_2xx_rate');
const renderStatus3xxRate = new Rate('render_status_3xx_rate');
const renderStatus4xxRate = new Rate('render_status_4xx_rate');
const renderStatus5xxRate = new Rate('render_status_5xx_rate');
const renderStatusOtherRate = new Rate('render_status_other_rate');
const renderContentTypeMismatchRate = new Rate('render_content_type_mismatch_rate');
const renderLatency = new Trend('render_latency', true);
const renderCacheHitFailureRate = new Rate('render_cache_hit_failure_rate');
const renderCacheHitContentTypeMismatchRate = new Rate('render_cache_hit_content_type_mismatch_rate');
const renderCacheHitLatency = new Trend('render_cache_hit_latency', true);
const renderCacheMissFailureRate = new Rate('render_cache_miss_failure_rate');
const renderCacheMissContentTypeMismatchRate = new Rate('render_cache_miss_content_type_mismatch_rate');
const renderCacheMissLatency = new Trend('render_cache_miss_latency', true);
const renderCacheMissObservedRate = new Rate('render_cache_miss_observed_rate');
const renderCacheMissObservedCount = new Counter('render_cache_miss_observed_count');
const renderStageCacheSetLatency = new Trend('render_stage_cache_set_latency', true);
const renderStageFetchLatency = new Trend('render_stage_fetch_latency', true);
const renderStageLookupLatency = new Trend('render_stage_lookup_latency', true);
const renderStageTouchLatency = new Trend('render_stage_touch_latency', true);
const renderStageTransformLatency = new Trend('render_stage_transform_latency', true);
const renderCacheDisabledRate = new Rate('render_cache_disabled_rate');
const renderCacheUnknownRate = new Rate('render_cache_unknown_rate');
const renderCacheUnknownLatency = new Trend('render_cache_unknown_latency', true);
const profileMetrics = authBearerToken
  ? {
    failureRate: new Rate('profile_failure_rate'),
    latency: new Trend('profile_latency', true),
  }
  : null;
const analyzeMetrics = enableAnalyze
  ? {
    failureRate: new Rate('analyze_failure_rate'),
    latency: new Trend('analyze_latency', true),
  }
  : null;

const thresholds = {
  http_req_failed: ['rate<0.10'],
  render_failure_rate: ['rate<0.05'],
  render_content_type_mismatch_rate: ['rate<0.00001'],
  render_latency: ['p(95)<1500'],
  render_cache_hit_content_type_mismatch_rate: ['rate<0.00001'],
  ...(requireMediaRenderCacheHeader
    ? {
      render_cache_hit_failure_rate: ['rate<0.05'],
      render_cache_hit_latency: ['p(95)<1500'],
      render_cache_disabled_rate: ['rate<0.00001'],
      render_cache_unknown_rate: ['rate<0.00001'],
    }
    : {}),
  ...(requireMediaRenderCacheHeader && mediaRenderCacheMissUrls.length > 0
    ? {
      render_cache_miss_failure_rate: ['rate<0.05'],
      render_cache_miss_latency: [`p(95)<${renderCacheMissP95HardThresholdMs}`],
      render_cache_miss_observed_rate: ['rate>0.00001'],
      render_cache_miss_observed_count: [`count>=${minRenderCacheMissSamples}`],
    }
    : {}),
  render_cache_miss_content_type_mismatch_rate: ['rate<0.00001'],
  ...(profileMetrics
    ? {
      profile_failure_rate: ['rate<0.10'],
      profile_latency: ['p(95)<1200'],
    }
    : {}),
  ...(analyzeMetrics
    ? {
      analyze_failure_rate: ['rate<0.20'],
      analyze_latency: ['p(95)<2500'],
    }
    : {}),
};

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-vus',
      vus: Number(__ENV.BASELINE_VUS || '20'),
      duration: (__ENV.BASELINE_DURATION || '60s').trim(),
    },
  },
  thresholds,
};

function isStatus2xx(status) {
  return status >= 200 && status < 300;
}

function isStatus3xx(status) {
  return status >= 300 && status < 400;
}

function isStatus4xx(status) {
  return status >= 400 && status < 500;
}

function isStatus5xx(status) {
  return status >= 500 && status < 600;
}

function isStatusOther(status) {
  return (
    !isStatus2xx(status)
    && !isStatus3xx(status)
    && !isStatus4xx(status)
    && !isStatus5xx(status)
  );
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isSignedMediaRenderUrl(value) {
  const text = String(value || '').trim();
  return (
    !/[\n\r\t]/.test(text)
    && /^https?:\/\//.test(text)
    && text.includes('/media/render/')
    && /[?&]exp=/.test(text)
    && /[?&]sig=/.test(text)
  );
}

function getHeader(headers, headerName) {
  return Object.entries(headers).find(
    ([name]) => name.toLowerCase() === headerName.toLowerCase(),
  )?.[1];
}

function isImageContentType(headers) {
  const contentType = getHeader(headers, 'content-type');
  return String(contentType || '').trim().toLowerCase().startsWith('image/');
}

function normalizeCacheStatus(headers) {
  const cacheStatus = String(getHeader(headers, 'x-media-render-cache') || '').trim().toLowerCase();
  if (cacheStatus === 'hit' || cacheStatus === 'miss' || cacheStatus === 'disabled') {
    return cacheStatus;
  }
  return 'unknown';
}

function parseRenderStageHeader(headers) {
  const header = String(getHeader(headers, 'x-media-render-stage-ms') || '').trim();
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(',')
      .map((entry) => entry.trim().split('='))
      .filter(([name, value]) => name && value && Number.isFinite(Number(value)))
      .map(([name, value]) => [name, Number(value)]),
  );
}

function recordRenderStageMetrics(headers) {
  const stageMs = parseRenderStageHeader(headers);
  if (Number.isFinite(stageMs.cache_set)) renderStageCacheSetLatency.add(stageMs.cache_set);
  if (Number.isFinite(stageMs.fetch)) renderStageFetchLatency.add(stageMs.fetch);
  if (Number.isFinite(stageMs.lookup)) renderStageLookupLatency.add(stageMs.lookup);
  if (Number.isFinite(stageMs.touch)) renderStageTouchLatency.add(stageMs.touch);
  if (Number.isFinite(stageMs.transform)) renderStageTransformLatency.add(stageMs.transform);
}

function recordSplitRenderMetrics(response, ok, renderContentTypeMatches, isCacheMissCandidate) {
  const cacheStatus = normalizeCacheStatus(response.headers);
  renderCacheDisabledRate.add(cacheStatus === 'disabled');
  renderCacheUnknownRate.add(cacheStatus === 'unknown');
  if (isCacheMissCandidate) {
    renderCacheMissObservedRate.add(cacheStatus === 'miss');
    if (cacheStatus === 'miss') renderCacheMissObservedCount.add(1);
  }
  if (cacheStatus === 'hit') {
    renderCacheHitLatency.add(response.timings.duration);
    renderCacheHitFailureRate.add(!ok);
    renderCacheHitContentTypeMismatchRate.add(isStatus2xx(response.status) && !renderContentTypeMatches);
    return;
  }
  if (cacheStatus === 'miss') {
    renderCacheMissLatency.add(response.timings.duration);
    renderCacheMissFailureRate.add(!ok);
    renderCacheMissContentTypeMismatchRate.add(isStatus2xx(response.status) && !renderContentTypeMatches);
    recordRenderStageMetrics(response.headers);
    return;
  }
  renderCacheUnknownLatency.add(response.timings.duration);
}

function runRenderRequest(url, isCacheMissCandidate) {
  const response = http.get(url, {
    headers: { Accept: 'image/webp,image/*,*/*;q=0.8' },
  });
  const renderContentTypeMatches = isImageContentType(response.headers);
  renderLatency.add(response.timings.duration);
  renderStatus2xxRate.add(isStatus2xx(response.status));
  renderStatus3xxRate.add(isStatus3xx(response.status));
  renderStatus4xxRate.add(isStatus4xx(response.status));
  renderStatus5xxRate.add(isStatus5xx(response.status));
  renderStatusOtherRate.add(isStatusOther(response.status));
  renderContentTypeMismatchRate.add(isStatus2xx(response.status) && !renderContentTypeMatches);
  const ok = check(response, {
    'render status is 200': (r) => r.status === 200,
    'render content type image/*': (r) => isImageContentType(r.headers),
  });
  renderFailureRate.add(!ok);
  recordSplitRenderMetrics(response, ok, renderContentTypeMatches, isCacheMissCandidate);
}

function selectCacheMissUrl() {
  if (mediaRenderCacheMissUrls.length === 0 || __ITER % renderCacheMissEvery !== 0) {
    return '';
  }
  return mediaRenderCacheMissUrls[(__VU + __ITER) % mediaRenderCacheMissUrls.length];
}

function runProfileRequest() {
  if (!authBearerToken || !profileMetrics) return;
  const response = http.get(`${baseUrl}/me/profile`, {
    headers: {
      Authorization: `Bearer ${authBearerToken}`,
      Accept: 'application/json',
    },
  });
  profileMetrics.latency.add(response.timings.duration);
  const profileStatusLabel = requireProfileAuthSuccess ? 'profile status is 200' : 'profile status is 200/401';
  const ok = check(response, {
    [profileStatusLabel]: (r) => (requireProfileAuthSuccess ? r.status === 200 : r.status === 200 || r.status === 401),
  });
  profileMetrics.failureRate.add(!ok);
}

function runAnalyzeRequest() {
  if (!enableAnalyze || !analyzeBinary || !analyzeMetrics) return;
  if (__ITER % analyzeEvery !== 0) return;

  const payload = {
    file: http.file(analyzeBinary, 'baseline.jpg', 'image/jpeg'),
    allergy_info: analyzeAllergy,
    locale: analyzeLocale,
  };
  const response = http.post(`${baseUrl}/analyze/label`, payload);
  analyzeMetrics.latency.add(response.timings.duration);
  const ok = check(response, {
    'analyze status is 200/429': (r) => r.status === 200 || r.status === 429,
  });
  analyzeMetrics.failureRate.add(!ok);
}

export default function () {
  runRenderRequest(mediaRenderCacheHitUrl || mediaRenderUrl, false);
  const cacheMissUrl = selectCacheMissUrl();
  if (cacheMissUrl) {
    runRenderRequest(cacheMissUrl, true);
  }
  runProfileRequest();
  runAnalyzeRequest();
  sleep(Math.max(0, thinkTimeMs) / 1000);
}
