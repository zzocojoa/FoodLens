import { useResultScrollAnimations } from './resultUiUtils';
import { useBreakdownState } from './useBreakdownState';

export function useResultUI() {
  const { scrollY, scrollHandler, imageAnimatedStyle, headerOverlayStyle } = useResultScrollAnimations();
  const { isBreakdownOpen, openBreakdown, closeBreakdown } = useBreakdownState();

  return {
    scrollY,
    scrollHandler,
    imageAnimatedStyle,
    headerOverlayStyle,
    isBreakdownOpen,
    openBreakdown,
    closeBreakdown,
  };
}
