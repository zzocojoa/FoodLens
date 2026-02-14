import { BarcodeLookupResult } from './types';

type SafetyStatus = 'SAFE' | 'CAUTION' | 'DANGER';

export type AnalysisApiContract = {
  foodName: string;
  safetyStatus: SafetyStatus;
  ingredients: unknown[];
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
