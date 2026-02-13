import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    SlideInDown,
    SlideOutDown,
} from 'react-native-reanimated';
import GuideExampleCard from './infoBottomSheet/components/GuideExampleCard';
import { GUIDE_EXAMPLES } from './infoBottomSheet/constants';
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
        <Modal
            visible={isVisible}
            transparent
            statusBarTranslucent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Animated.View entering={FadeIn} exiting={FadeOut} style={StyleSheet.absoluteFill}>
                    <TouchableOpacity
                        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
                        activeOpacity={1}
                        onPress={onClose}
                    />
                </Animated.View>

                <GestureDetector gesture={gesture}>
                    <Animated.View
                        entering={SlideInDown.duration(400).easing(Easing.out(Easing.cubic))}
                        exiting={SlideOutDown}
                        style={[styles.sheetContainer, animatedStyle]}
                    >
                        <View style={styles.handleBar} />

                        <View style={styles.contentContainer}>
                            <Text style={styles.title}>진행하기 전</Text>
                            <Text style={styles.description}>
                                이미지처럼 음식을 사진으로 찍거나 업로드해 주세요.{'\n'}
                                사진 촬영 시에는 음식이 보조 박스 안에 들어오도록 해주세요.
                            </Text>

                            <View style={styles.gridContainer}>
                                {GUIDE_EXAMPLES.map((item) => (
                                    <GuideExampleCard key={item.key} item={item} />
                                ))}
                            </View>

                            <TouchableOpacity
                                onPress={onClose}
                                style={styles.button}
                                activeOpacity={0.9}
                            >
                                <Text style={styles.buttonText}>알겠어요</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </GestureDetector>
            </View>
        </Modal>
    );
};
