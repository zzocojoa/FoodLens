import { ANALYSIS_TIMEOUT_MS } from '../constants';

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: any;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms} ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const runWithAnalysisTimeout = <T>(promise: Promise<T>): Promise<T> => {
  return withTimeout(promise, ANALYSIS_TIMEOUT_MS);
};

