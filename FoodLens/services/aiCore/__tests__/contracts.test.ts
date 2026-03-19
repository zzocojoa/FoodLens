import {
  assertAnalysisResponseContract,
  assertAnalysisJobStatusContract,
  assertAnalysisJobSubmitContract,
  assertBarcodeLookupContract,
} from '../contracts';

describe('aiCore contracts', () => {
  it('accepts valid analysis response shape', () => {
    const payload = {
      foodName: 'Kimbap',
      safetyStatus: 'SAFE',
      ingredients: [{ name: 'rice', isAllergen: false }],
    };

    expect(assertAnalysisResponseContract(payload, '/analyze')).toEqual(payload);
  });

  it('rejects invalid analysis response shape', () => {
    const payload = {
      food_name: 'Kimbap',
      status: 'SAFE',
      ingredients: [],
    };

    expect(() =>
      assertAnalysisResponseContract(payload as unknown, '/analyze')
    ).toThrow('[AI Contract] /analyze: missing/invalid "foodName"');
  });

  it('accepts valid barcode lookup shape', () => {
    const payload = {
      found: true,
      data: { food_name: 'Protein Bar' },
    };

    expect(assertBarcodeLookupContract(payload)).toEqual(payload);
  });

  it('rejects invalid barcode lookup shape', () => {
    const payload = { ok: true };
    expect(() =>
      assertBarcodeLookupContract(payload as unknown)
    ).toThrow('[AI Contract] /lookup/barcode: missing/invalid "found"');
  });

  it('accepts valid analysis job submit shape', () => {
    const payload = {
      job_id: 'job_123',
      request_id: 'req_123',
      status: 'queued',
      accepted_at: '2026-03-17T00:00:00Z',
      poll_after_ms: 1000,
    };

    expect(assertAnalysisJobSubmitContract(payload)).toEqual(payload);
  });

  it('accepts valid analysis job status shape', () => {
    const payload = {
      job_id: 'job_123',
      request_id: 'req_123',
      status: 'completed',
      accepted_at: '2026-03-17T00:00:00Z',
      updated_at: '2026-03-17T00:00:10Z',
      poll_after_ms: 0,
    };

    expect(assertAnalysisJobStatusContract(payload)).toEqual(payload);
  });
});
