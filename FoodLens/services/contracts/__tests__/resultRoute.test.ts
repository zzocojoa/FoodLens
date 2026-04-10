import {
  buildResultRoute,
  parseResultAnalysisOrigin,
  parseResultRouteFlags,
} from '../resultRoute';

describe('resultRoute', () => {
  it('builds result route with analysis origin', () => {
    expect(
      buildResultRoute({
        isNew: true,
        isBarcode: true,
        analysisOrigin: 'barcode_lookup',
        sourceType: 'camera',
      })
    ).toEqual({
      pathname: '/result',
      params: {
        fromStore: 'true',
        isNew: 'true',
        isBarcode: 'true',
        analysisOrigin: 'barcode_lookup',
        sourceType: 'camera',
      },
    });
  });

  it('parses analysis origin from route params', () => {
    expect(
      parseResultRouteFlags({
        fromStore: 'true',
        analysisOrigin: 'barcode_to_label_fallback',
      })
    ).toMatchObject({
      fromStoreMode: true,
      analysisOrigin: 'barcode_to_label_fallback',
    });
  });

  it('rejects invalid analysis origin params', () => {
    expect(parseResultAnalysisOrigin('bad_origin')).toBeUndefined();
  });
});
