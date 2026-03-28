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
      request_id: 'req-analyze-1',
      prompt_version: 'food-v3.2-context-engineered',
      used_model: 'gemini-2.5-pro',
      latency_ms: { total: 1300 },
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
      request_id: 'req-barcode-1',
      used_model: 'gemini-2.5-pro',
      prompt_version: 'label-v1.2-2pass-locale-country',
      latency_ms: { total: 321, source_lookup: 120 },
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
      used_model: 'gemini-2.5-pro',
      prompt_version: 'food-v3.2-context-engineered',
      fallback_reason: 'analysis_fallback',
      latency_ms_by_stage: {
        inference: 1100,
        total: 1400,
      },
    };

    expect(assertAnalysisJobStatusContract(payload)).toEqual(payload);
  });

  it('rejects invalid analysis job latency metadata', () => {
    const payload = {
      job_id: 'job_123',
      request_id: 'req_123',
      status: 'completed',
      accepted_at: '2026-03-17T00:00:00Z',
      updated_at: '2026-03-17T00:00:10Z',
      poll_after_ms: 0,
      latency_ms_by_stage: {
        total: 'bad',
      },
    };

    expect(() =>
      assertAnalysisJobStatusContract(payload as unknown)
    ).toThrow('[AI Contract] /analyze/jobs/{job_id}: missing/invalid "latency_ms_by_stage"');
  });
});
