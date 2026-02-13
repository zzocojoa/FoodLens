import React from 'react';
import { InfoBottomSheetView } from './infoBottomSheet/components/InfoBottomSheetView';
import { useInfoBottomSheet } from './infoBottomSheet/hooks/useInfoBottomSheet';
import { infoBottomSheetStyles as styles } from './infoBottomSheet/styles';
import { InfoBottomSheetProps } from './infoBottomSheet/types';
import { shouldRenderInfoBottomSheet } from './infoBottomSheet/utils/visibility';

/**
 * Calz 앱의 촬영 가이드 안내 바텀 시트 컴포넌트입니다.
 * Swipe-to-close 기능을 위해 Reanimated와 GestureHandler를 사용합니다.
 */
export const InfoBottomSheet: React.FC<InfoBottomSheetProps> = ({ isOpen, onClose }) => {
    const { isVisible, gesture, animatedStyle } = useInfoBottomSheet(isOpen, onClose);

    if (!shouldRenderInfoBottomSheet(isVisible, isOpen)) return null;

    return (
        <InfoBottomSheetView
            isVisible={isVisible}
            onClose={onClose}
            gesture={gesture}
            animatedStyle={animatedStyle}
            styles={styles}
        />
    );
};
