import { useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BreakdownOverlayProps } from '../types';
import { buildBreakdownViewModel } from '../utils/breakdownData';
import { shouldRenderBreakdownOverlay } from '../utils/visibility';
import { useBreakdownPanGesture } from './useBreakdownPanGesture';

export const useBreakdownOverlayModel = ({ isOpen, onClose, resultData }: BreakdownOverlayProps) => {
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
