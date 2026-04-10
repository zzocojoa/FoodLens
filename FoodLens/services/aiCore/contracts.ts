import {
  AnalysisOrigin,
  BarcodeLookupResult,
  DecisionConfidence,
  DecisionStatus,
  LatencyMsBreakdown,
  LatencyMsByStage,
  RecommendedAction,
  SafetyStatus,
  UncertaintyReason,
} from './types';

export type AnalysisApiContract = {
  foodName: string;
  safetyStatus: SafetyStatus;
  ingredients: unknown[];
  decision_status?: DecisionStatus;
  analysis_origin?: AnalysisOrigin;
  recommended_action?: RecommendedAction;
  uncertainty_reason?: UncertaintyReason;
  decision_confidence?: DecisionConfidence;
  request_id?: string;
  prompt_version?: string;
  used_model?: string;
  latency_ms?: LatencyMsBreakdown;
};

export type AnalysisJobSubmitContract = {
  job_id: string;
  request_id: string;
  status: 'queued';
  accepted_at: string;
  poll_after_ms: number;
};

export type AnalysisJobStatusContract = {
  job_id: string;
  request_id: string;
  status:
    | 'queued'
    | 'preprocessing'
    | 'inference'
    | 'nutrition'
    | 'finalizing'
    | 'completed'
    | 'fallback_completed'
    | 'failed';
  poll_after_ms: number;
  accepted_at: string;
  updated_at: string;
  used_model?: string;
  prompt_version?: string;
  latency_ms_by_stage?: LatencyMsByStage;
  fallback_reason?: string;
  decision_status?: DecisionStatus;
  analysis_origin?: AnalysisOrigin;
  recommended_action?: RecommendedAction;
  uncertainty_reason?: UncertaintyReason;
  decision_confidence?: DecisionConfidence;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSafetyStatus = (value: unknown): value is SafetyStatus =>
  value === 'SAFE' || value === 'CAUTION' || value === 'DANGER';

const isDecisionStatus = (value: unknown): value is DecisionStatus =>
  value === 'OK' || value === 'ASK' || value === 'AVOID';

const isAnalysisOrigin = (value: unknown): value is AnalysisApiContract['analysis_origin'] =>
  value === 'food_photo' ||
  value === 'label_photo' ||
  value === 'barcode_lookup' ||
  value === 'barcode_to_label_fallback';

const isRecommendedAction = (value: unknown): value is AnalysisApiContract['recommended_action'] =>
  value === 'eat' ||
  value === 'verify_label' ||
  value === 'ask_staff' ||
  value === 'avoid';

const isUncertaintyReason = (value: unknown): value is AnalysisApiContract['uncertainty_reason'] =>
  value === 'image_ambiguity' ||
  value === 'missing_label_text' ||
  value === 'barcode_not_found' ||
  value === 'low_confidence' ||
  value === 'unknown';

const isDecisionConfidence = (value: unknown): value is AnalysisApiContract['decision_confidence'] =>
  value === 'high' || value === 'medium' || value === 'low';

const assertOptionalString = ({
  value,
  fieldName,
  endpoint,
}: {
  value: unknown;
  fieldName: string;
  endpoint: string;
}): void => {
  if (value === undefined || value === null) return;
  if (typeof value === 'string') return;
  throw new Error(`[AI Contract] ${endpoint}: missing/invalid "${fieldName}"`);
};

const assertOptionalEnumValue = ({
  value,
  fieldName,
  endpoint,
  isValid,
}: {
  value: unknown;
  fieldName: string;
  endpoint: string;
  isValid: (candidate: unknown) => boolean;
}): void => {
  if (value === undefined || value === null) return;
  if (isValid(value)) return;
  throw new Error(`[AI Contract] ${endpoint}: missing/invalid "${fieldName}"`);
};

const assertOptionalLatencyMsByStage = ({
  value,
  endpoint,
}: {
  value: unknown;
  endpoint: string;
}): void => {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) {
    throw new Error(`[AI Contract] ${endpoint}: missing/invalid "latency_ms_by_stage"`);
  }

  const hasInvalidEntry = Object.values(value).some((itemValue) => typeof itemValue !== 'number');
  if (hasInvalidEntry) {
    throw new Error(`[AI Contract] ${endpoint}: missing/invalid "latency_ms_by_stage"`);
  }
};

const assertOptionalLatencyMs = ({
  value,
  endpoint,
}: {
  value: unknown;
  endpoint: string;
}): void => {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) {
    throw new Error(`[AI Contract] ${endpoint}: missing/invalid "latency_ms"`);
  }

  const hasInvalidEntry = Object.values(value).some((itemValue) => typeof itemValue !== 'number');
  if (hasInvalidEntry) {
    throw new Error(`[AI Contract] ${endpoint}: missing/invalid "latency_ms"`);
  }
};

const assertOptionalBarcodeDecisionMetadata = (value: unknown): void => {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) {
    throw new Error('[AI Contract] /lookup/barcode: missing/invalid "data"');
  }

  assertOptionalEnumValue({
    value: value['decision_status'],
    fieldName: 'data.decision_status',
    endpoint: '/lookup/barcode',
    isValid: isDecisionStatus,
  });
  assertOptionalEnumValue({
    value: value['analysis_origin'],
    fieldName: 'data.analysis_origin',
    endpoint: '/lookup/barcode',
    isValid: isAnalysisOrigin,
  });
  assertOptionalEnumValue({
    value: value['recommended_action'],
    fieldName: 'data.recommended_action',
    endpoint: '/lookup/barcode',
    isValid: isRecommendedAction,
  });
  assertOptionalEnumValue({
    value: value['uncertainty_reason'],
    fieldName: 'data.uncertainty_reason',
    endpoint: '/lookup/barcode',
    isValid: isUncertaintyReason,
  });
  assertOptionalEnumValue({
    value: value['decision_confidence'],
    fieldName: 'data.decision_confidence',
    endpoint: '/lookup/barcode',
    isValid: isDecisionConfidence,
  });
};

export const assertAnalysisResponseContract = (
  value: unknown,
  endpoint: '/analyze' | '/analyze/label' | '/analyze/smart'
): AnalysisApiContract => {
  if (!isRecord(value)) {
    throw new Error(`[AI Contract] ${endpoint}: response is not an object`);
  }

  if (typeof value['foodName'] !== 'string') {
    throw new Error(`[AI Contract] ${endpoint}: missing/invalid "foodName"`);
  }

  if (!isSafetyStatus(value['safetyStatus'])) {
    throw new Error(`[AI Contract] ${endpoint}: missing/invalid "safetyStatus"`);
  }

  if (!Array.isArray(value['ingredients'])) {
    throw new Error(`[AI Contract] ${endpoint}: missing/invalid "ingredients"`);
  }

  assertOptionalString({
    value: value['request_id'],
    fieldName: 'request_id',
    endpoint,
  });
  assertOptionalString({
    value: value['prompt_version'],
    fieldName: 'prompt_version',
    endpoint,
  });
  assertOptionalString({
    value: value['used_model'],
    fieldName: 'used_model',
    endpoint,
  });
  assertOptionalEnumValue({
    value: value['decision_status'],
    fieldName: 'decision_status',
    endpoint,
    isValid: isDecisionStatus,
  });
  assertOptionalEnumValue({
    value: value['analysis_origin'],
    fieldName: 'analysis_origin',
    endpoint,
    isValid: isAnalysisOrigin,
  });
  assertOptionalEnumValue({
    value: value['recommended_action'],
    fieldName: 'recommended_action',
    endpoint,
    isValid: isRecommendedAction,
  });
  assertOptionalEnumValue({
    value: value['uncertainty_reason'],
    fieldName: 'uncertainty_reason',
    endpoint,
    isValid: isUncertaintyReason,
  });
  assertOptionalEnumValue({
    value: value['decision_confidence'],
    fieldName: 'decision_confidence',
    endpoint,
    isValid: isDecisionConfidence,
  });

  assertOptionalLatencyMs({
    value: value['latency_ms'],
    endpoint,
  });

  return value as AnalysisApiContract;
};

export const assertBarcodeLookupContract = (value: unknown): BarcodeLookupResult => {
  if (!isRecord(value)) {
    throw new Error('[AI Contract] /lookup/barcode: response is not an object');
  }

  if (typeof value['found'] !== 'boolean') {
    throw new Error('[AI Contract] /lookup/barcode: missing/invalid "found"');
  }

  assertOptionalString({
    value: value['request_id'],
    fieldName: 'request_id',
    endpoint: '/lookup/barcode',
  });
  assertOptionalString({
    value: value['used_model'],
    fieldName: 'used_model',
    endpoint: '/lookup/barcode',
  });
  assertOptionalString({
    value: value['prompt_version'],
    fieldName: 'prompt_version',
    endpoint: '/lookup/barcode',
  });
  assertOptionalLatencyMs({
    value: value['latency_ms'],
    endpoint: '/lookup/barcode',
  });
  assertOptionalBarcodeDecisionMetadata(value['data']);

  return value as BarcodeLookupResult;
};

export const assertAnalysisJobSubmitContract = (value: unknown): AnalysisJobSubmitContract => {
  if (!isRecord(value)) {
    throw new Error('[AI Contract] /analyze/jobs: response is not an object');
  }

  if (typeof value['job_id'] !== 'string') {
    throw new Error('[AI Contract] /analyze/jobs: missing/invalid "job_id"');
  }

  if (typeof value['request_id'] !== 'string') {
    throw new Error('[AI Contract] /analyze/jobs: missing/invalid "request_id"');
  }

  if (value['status'] !== 'queued') {
    throw new Error('[AI Contract] /analyze/jobs: missing/invalid "status"');
  }

  if (typeof value['accepted_at'] !== 'string') {
    throw new Error('[AI Contract] /analyze/jobs: missing/invalid "accepted_at"');
  }

  if (typeof value['poll_after_ms'] !== 'number') {
    throw new Error('[AI Contract] /analyze/jobs: missing/invalid "poll_after_ms"');
  }

  return value as AnalysisJobSubmitContract;
};

export const assertAnalysisJobStatusContract = (value: unknown): AnalysisJobStatusContract => {
  if (!isRecord(value)) {
    throw new Error('[AI Contract] /analyze/jobs/{job_id}: response is not an object');
  }

  if (typeof value['job_id'] !== 'string') {
    throw new Error('[AI Contract] /analyze/jobs/{job_id}: missing/invalid "job_id"');
  }

  if (typeof value['request_id'] !== 'string') {
    throw new Error('[AI Contract] /analyze/jobs/{job_id}: missing/invalid "request_id"');
  }

  const status = value['status'];
  if (
    status !== 'queued' &&
    status !== 'preprocessing' &&
    status !== 'inference' &&
    status !== 'nutrition' &&
    status !== 'finalizing' &&
    status !== 'completed' &&
    status !== 'fallback_completed' &&
    status !== 'failed'
  ) {
    throw new Error('[AI Contract] /analyze/jobs/{job_id}: missing/invalid "status"');
  }

  if (typeof value['accepted_at'] !== 'string') {
    throw new Error('[AI Contract] /analyze/jobs/{job_id}: missing/invalid "accepted_at"');
  }

  if (typeof value['updated_at'] !== 'string') {
    throw new Error('[AI Contract] /analyze/jobs/{job_id}: missing/invalid "updated_at"');
  }

  if (typeof value['poll_after_ms'] !== 'number') {
    throw new Error('[AI Contract] /analyze/jobs/{job_id}: missing/invalid "poll_after_ms"');
  }

  assertOptionalString({
    value: value['used_model'],
    fieldName: 'used_model',
    endpoint: '/analyze/jobs/{job_id}',
  });
  assertOptionalString({
    value: value['prompt_version'],
    fieldName: 'prompt_version',
    endpoint: '/analyze/jobs/{job_id}',
  });
  assertOptionalString({
    value: value['fallback_reason'],
    fieldName: 'fallback_reason',
    endpoint: '/analyze/jobs/{job_id}',
  });
  assertOptionalEnumValue({
    value: value['decision_status'],
    fieldName: 'decision_status',
    endpoint: '/analyze/jobs/{job_id}',
    isValid: isDecisionStatus,
  });
  assertOptionalEnumValue({
    value: value['analysis_origin'],
    fieldName: 'analysis_origin',
    endpoint: '/analyze/jobs/{job_id}',
    isValid: isAnalysisOrigin,
  });
  assertOptionalEnumValue({
    value: value['recommended_action'],
    fieldName: 'recommended_action',
    endpoint: '/analyze/jobs/{job_id}',
    isValid: isRecommendedAction,
  });
  assertOptionalEnumValue({
    value: value['uncertainty_reason'],
    fieldName: 'uncertainty_reason',
    endpoint: '/analyze/jobs/{job_id}',
    isValid: isUncertaintyReason,
  });
  assertOptionalEnumValue({
    value: value['decision_confidence'],
    fieldName: 'decision_confidence',
    endpoint: '/analyze/jobs/{job_id}',
    isValid: isDecisionConfidence,
  });
  assertOptionalLatencyMsByStage({
    value: value['latency_ms_by_stage'],
    endpoint: '/analyze/jobs/{job_id}',
  });

  return value as AnalysisJobStatusContract;
};
