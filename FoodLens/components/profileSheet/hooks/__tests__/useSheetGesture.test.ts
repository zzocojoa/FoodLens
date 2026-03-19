import { act, renderHook } from '@testing-library/react-native';
import { useSheetGesture } from '../useSheetGesture';

type AnimatedValueReader = {
  __getValue: () => number;
};

describe('useSheetGesture', () => {
  it('opens immediately when open animation is disabled', () => {
    const { result } = renderHook(() =>
      useSheetGesture(jest.fn(), {
        animateOnOpen: false,
      })
    );

    act(() => {
      result.current.openSheet();
    });

    expect((result.current.panY as unknown as AnimatedValueReader).__getValue()).toBe(0);
  });
});
