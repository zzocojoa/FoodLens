import { Dimensions } from 'react-native';

import { isBarcodeInCenteredRoi } from '../barcodeScannerUtils';

describe('barcodeScannerUtils.isBarcodeInCenteredRoi', () => {
  beforeEach(() => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 400,
      height: 800,
      scale: 1,
      fontScale: 1,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows scan when bounds are missing', () => {
    const result = isBarcodeInCenteredRoi({ bounds: undefined } as never, 280);
    expect(result).toBe(true);
  });

  it('accepts direct coordinates in the centered ROI', () => {
    const result = isBarcodeInCenteredRoi(
      {
        bounds: {
          origin: { x: 170, y: 370 },
          size: { width: 60, height: 60 },
        },
      } as never,
      280
    );
    expect(result).toBe(true);
  });

  it('accepts normalized coordinates in the centered ROI', () => {
    const result = isBarcodeInCenteredRoi(
      {
        bounds: {
          origin: { x: 0.425, y: 0.4625 },
          size: { width: 0.15, height: 0.075 },
        },
      } as never,
      280
    );
    expect(result).toBe(true);
  });

  it('does not block when bounds use a mismatched coordinate space', () => {
    const result = isBarcodeInCenteredRoi(
      {
        bounds: {
          origin: { x: 1400, y: 2200 },
          size: { width: 180, height: 120 },
        },
      } as never,
      280
    );
    expect(result).toBe(true);
  });
});
