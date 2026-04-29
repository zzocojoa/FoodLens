import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = (__ENV.BASE_URL || '').replace(/\/+$/, '');
const mediaRenderUrl = (__ENV.MEDIA_RENDER_URL || '').trim();
const authBearerToken = (__ENV.AUTH_BEARER_TOKEN || '').trim();
const enableAnalyze = (__ENV.ENABLE_ANALYZE || '0').trim() === '1';
const analyzePath = (__ENV.ANALYZE_PATH || '').trim();
const analyzeLocale = (__ENV.ANALYZE_LOCALE || 'ko-KR').trim();
const analyzeAllergy = (__ENV.ANALYZE_ALLERGY || 'egg').trim();
const thinkTimeMs = Number(__ENV.THINK_TIME_MS || '200');
const analyzeEvery = Math.max(1, Number(__ENV.ANALYZE_EVERY || '10'));

if (!mediaRenderUrl) {
  throw new Error('MEDIA_RENDER_URL is required.');
}
if ((authBearerToken || enableAnalyze) && !baseUrl) {
  throw new Error('BASE_URL is required when AUTH_BEARER_TOKEN is set or ENABLE_ANALYZE=1.');
}

let analyzeBinary = null;
if (enableAnalyze) {
  if (!analyzePath) {
    throw new Error('ANALYZE_PATH is required when ENABLE_ANALYZE=1.');
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
  render_latency: ['p(95)<1500'],
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

function isImageContentType(headers) {
  const contentType = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === 'content-type',
  )?.[1];
  return String(contentType || '').trim().toLowerCase().startsWith('image/');
}

function runRenderRequest() {
  const response = http.get(mediaRenderUrl, {
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
  const ok = check(response, {
    'profile status is 200/401': (r) => r.status === 200 || r.status === 401,
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
  runRenderRequest();
  runProfileRequest();
  runAnalyzeRequest();
  sleep(Math.max(0, thinkTimeMs) / 1000);
}
