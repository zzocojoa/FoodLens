import { useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildBreakdownViewModel } from '../utils/breakdownData';
import { shouldRenderBreakdownOverlay } from '../utils/visibility';
import { useBreakdownPanGesture } from './useBreakdownPanGesture';

type BreakdownOverlayModelInput = {
  isOpen: boolean;
  onClose: () => void;
  resultData: import('@/services/ai').AnalyzedData | null;
};

export const useBreakdownOverlayModel = ({ isOpen, onClose, resultData }: BreakdownOverlayModelInput) => {
  const insets = useSafeAreaInsets();
  const { translateY, opacity, panResponder } = useBreakdownPanGesture(onClose);
  const wasOpen = useRef(isOpen);

  // Synchronous reset when re-opening
  if (isOpen && !wasOpen.current) {
    translateY.setValue(0);
    opacity.setValue(1);
  }
  wasOpen.current = isOpen;

  const shouldRender = shouldRenderBreakdownOverlay(isOpen, !!resultData) && !!resultData;
  const model = resultData ? buildBreakdownViewModel(resultData) : null;

  return {
    insets,
    translateY,
    opacity,
    panResponder,
    shouldRender,
    model,
  };
};
