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
const renderLatency = new Trend('render_latency', true);
const profileFailureRate = new Rate('profile_failure_rate');
const profileLatency = new Trend('profile_latency', true);
const analyzeFailureRate = new Rate('analyze_failure_rate');
const analyzeLatency = new Trend('analyze_latency', true);

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-vus',
      vus: Number(__ENV.K6_VUS || '20'),
      duration: (__ENV.K6_DURATION || '60s').trim(),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    render_failure_rate: ['rate<0.05'],
    render_latency: ['p(95)<1500'],
    profile_failure_rate: ['rate<0.10'],
    profile_latency: ['p(95)<1200'],
    analyze_failure_rate: ['rate<0.20'],
    analyze_latency: ['p(95)<2500'],
  },
};

function runRenderRequest() {
  const response = http.get(mediaRenderUrl, {
    headers: { Accept: 'image/webp,image/*,*/*;q=0.8' },
  });
  renderLatency.add(response.timings.duration);
  const ok = check(response, {
    'render status is 200': (r) => r.status === 200,
    'render content type image/*': (r) => String(r.headers['Content-Type'] || '').startsWith('image/'),
  });
  renderFailureRate.add(!ok);
}

function runProfileRequest() {
  if (!authBearerToken) return;
  const response = http.get(`${baseUrl}/me/profile`, {
    headers: {
      Authorization: `Bearer ${authBearerToken}`,
      Accept: 'application/json',
    },
  });
  profileLatency.add(response.timings.duration);
  const ok = check(response, {
    'profile status is 200/401': (r) => r.status === 200 || r.status === 401,
  });
  profileFailureRate.add(!ok);
}

function runAnalyzeRequest() {
  if (!enableAnalyze || !analyzeBinary) return;
  if (__ITER % analyzeEvery !== 0) return;

  const payload = {
    file: http.file(analyzeBinary, 'baseline.jpg', 'image/jpeg'),
    allergy_info: analyzeAllergy,
    locale: analyzeLocale,
  };
  const response = http.post(`${baseUrl}/analyze/label`, payload);
  analyzeLatency.add(response.timings.duration);
  const ok = check(response, {
    'analyze status is 200/429': (r) => r.status === 200 || r.status === 429,
  });
  analyzeFailureRate.add(!ok);
}

export default function () {
  runRenderRequest();
  runProfileRequest();
  runAnalyzeRequest();
  sleep(Math.max(0, thinkTimeMs) / 1000);
}
