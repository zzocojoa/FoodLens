import { BarcodeLookupResult } from './types';

type SafetyStatus = 'SAFE' | 'CAUTION' | 'DANGER';

export type AnalysisApiContract = {
  foodName: string;
  safetyStatus: SafetyStatus;
  ingredients: unknown[];
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
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSafetyStatus = (value: unknown): value is SafetyStatus =>
  value === 'SAFE' || value === 'CAUTION' || value === 'DANGER';

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

  return {
    foodName: value['foodName'],
    safetyStatus: value['safetyStatus'],
    ingredients: value['ingredients'],
  };
};

export const assertBarcodeLookupContract = (value: unknown): BarcodeLookupResult => {
  if (!isRecord(value)) {
    throw new Error('[AI Contract] /lookup/barcode: response is not an object');
  }

  if (typeof value['found'] !== 'boolean') {
    throw new Error('[AI Contract] /lookup/barcode: missing/invalid "found"');
  }

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

  return value as AnalysisJobStatusContract;
};
