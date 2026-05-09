import {
  assertAnalysisResponseContract,
  assertAnalysisJobStatusContract,
  assertAnalysisJobSubmitContract,
  assertBarcodeLookupContract,
} from '../contracts';

describe('aiCore contracts', () => {
  const invalidDecisionFields = [
    {
      fieldName: 'decision_status',
      validValue: 'OK',
      invalidValue: 'BAD',
      expectedError: 'missing/invalid "decision_status"',
    },
    {
      fieldName: 'analysis_origin',
      validValue: 'food_photo',
      invalidValue: 'bad_origin',
      expectedError: 'missing/invalid "analysis_origin"',
    },
    {
      fieldName: 'recommended_action',
      validValue: 'eat',
      invalidValue: 'bad_action',
      expectedError: 'missing/invalid "recommended_action"',
    },
    {
      fieldName: 'uncertainty_reason',
      validValue: 'unknown',
      invalidValue: 'bad_reason',
      expectedError: 'missing/invalid "uncertainty_reason"',
    },
    {
      fieldName: 'decision_confidence',
      validValue: 'high',
      invalidValue: 'bad_confidence',
      expectedError: 'missing/invalid "decision_confidence"',
    },
  ] as const;

  it('accepts valid analysis response shape', () => {
    const payload = {
      foodName: 'Kimbap',
      safetyStatus: 'SAFE',
      decision_status: 'OK',
      analysis_origin: 'food_photo',
      recommended_action: 'eat',
      uncertainty_reason: 'unknown',
      decision_confidence: 'high',
      ingredients: [{ name: 'rice', isAllergen: false }],
      request_id: 'req-analyze-1',
      prompt_version: 'food-v3.3.1-schema-compact',
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
      data: {
        food_name: 'Protein Bar',
        decision_status: 'OK',
        analysis_origin: 'barcode_lookup',
        recommended_action: 'eat',
        uncertainty_reason: 'unknown',
        decision_confidence: 'high',
      },
      request_id: 'req-barcode-1',
      used_model: 'gemini-2.5-pro',
      prompt_version: 'barcode-v1.1-allergen-compact',
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

  it.each(invalidDecisionFields)(
    'rejects invalid nested barcode $fieldName',
    ({ fieldName, invalidValue, expectedError, validValue }) => {
      const payload = {
        found: true,
        data: {
          food_name: 'Protein Bar',
          decision_status: 'OK',
          analysis_origin: 'barcode_lookup',
          recommended_action: 'eat',
          uncertainty_reason: 'unknown',
          decision_confidence: 'high',
          [fieldName]: invalidValue,
        },
      };

      expect(() =>
        assertBarcodeLookupContract(payload as unknown)
      ).toThrow(`[AI Contract] /lookup/barcode: ${expectedError.replace(fieldName, `data.${fieldName}`)}`);

      payload.data[fieldName] = validValue;
      expect(assertBarcodeLookupContract(payload)).toEqual(payload);
    }
  );

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
      prompt_version: 'food-v3.3.1-schema-compact',
      fallback_reason: 'analysis_fallback',
      decision_status: 'ASK',
      analysis_origin: 'label_photo',
      recommended_action: 'verify_label',
      uncertainty_reason: 'missing_label_text',
      decision_confidence: 'medium',
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

  it.each(invalidDecisionFields)(
    'rejects invalid analysis $fieldName',
    ({ fieldName, invalidValue, expectedError }) => {
      const payload = {
        foodName: 'Kimbap',
        safetyStatus: 'SAFE',
        ingredients: [],
        [fieldName]: invalidValue,
      };

      expect(() =>
        assertAnalysisResponseContract(payload as unknown, '/analyze')
      ).toThrow(`[AI Contract] /analyze: ${expectedError}`);
    }
  );

  it.each(invalidDecisionFields)(
    'rejects invalid analysis job $fieldName',
    ({ fieldName, invalidValue, expectedError }) => {
      const payload = {
        job_id: 'job_123',
        request_id: 'req_123',
        status: 'completed',
        accepted_at: '2026-03-17T00:00:00Z',
        updated_at: '2026-03-17T00:00:10Z',
        poll_after_ms: 0,
        [fieldName]: invalidValue,
      };

      expect(() =>
        assertAnalysisJobStatusContract(payload as unknown)
      ).toThrow(`[AI Contract] /analyze/jobs/{job_id}: ${expectedError}`);
    }
  );
});
