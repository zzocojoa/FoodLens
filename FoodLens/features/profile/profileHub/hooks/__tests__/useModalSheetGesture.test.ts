import { act, renderHook } from '@testing-library/react-native';
import { useModalSheetGesture } from '../useModalSheetGesture';

type AnimatedValueReader = {
  __getValue: () => number;
};

describe('useModalSheetGesture', () => {
  it('opens immediately when open animation is disabled', () => {
    const { result } = renderHook(() =>
      useModalSheetGesture(jest.fn(), {
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
      useModalSheetGesture(onCloseComplete, {
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
