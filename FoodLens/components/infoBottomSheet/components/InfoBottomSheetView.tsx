import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import GuideExampleCard from './GuideExampleCard';
import { GUIDE_EXAMPLES } from '../constants';
import { useI18n } from '@/features/i18n';

type InfoBottomSheetViewProps = {
  isVisible: boolean;
  onClose: () => void;
  gesture: any;
  animatedStyle: any;
  styles: any;
};

export const InfoBottomSheetView: React.FC<InfoBottomSheetViewProps> = ({
  isVisible,
  onClose,
  gesture,
  animatedStyle,
  styles,
}) => {
  const { t } = useI18n();
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
              <Text style={styles.title}>{t('infoBottomSheet.title', 'Before you continue')}</Text>
              <Text style={styles.description}>
                {t(
                  'infoBottomSheet.description',
                  'Please take or upload a photo of the food like the example.\nWhen taking a photo, keep the food inside the guide box.'
                )}
              </Text>

              <View style={styles.gridContainer}>
                {GUIDE_EXAMPLES.map((item) => (
                  <GuideExampleCard key={item.key} item={item} />
                ))}
              </View>

              <TouchableOpacity onPress={onClose} style={styles.button} activeOpacity={0.9}>
                <Text style={styles.buttonText}>{t('infoBottomSheet.confirm', 'Got it')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
};
