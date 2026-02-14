import {
  assertAnalysisResponseContract,
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
});
