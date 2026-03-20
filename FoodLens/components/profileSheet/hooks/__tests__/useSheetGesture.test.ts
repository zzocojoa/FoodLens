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
        animateOnClose: true,
      })
    );

    act(() => {
      result.current.openSheet();
    });

    expect((result.current.panY as unknown as AnimatedValueReader).__getValue()).toBe(0);
  });

  it('closes immediately when close animation is disabled', () => {
    const onCloseComplete = jest.fn();
    const { result } = renderHook(() =>
      useSheetGesture(onCloseComplete, {
        animateOnOpen: false,
        animateOnClose: false,
      })
    );

    act(() => {
      result.current.openSheet();
      result.current.closeSheet();
    });

    expect(onCloseComplete).toHaveBeenCalledTimes(1);
    expect((result.current.panY as unknown as AnimatedValueReader).__getValue()).toBe(800);
  });
});
