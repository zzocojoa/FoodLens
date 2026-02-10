import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Image, Modal, StyleSheet, Dimensions } from 'react-native';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  runOnJS, 
  SlideInDown, 
  SlideOutDown,
  FadeIn,
  FadeOut,
  Easing
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface InfoBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Calz 앱의 촬영 가이드 안내 바텀 시트 컴포넌트입니다.
 * Swipe-to-close 기능을 위해 Reanimated와 GestureHandler를 사용합니다.
 */
export const InfoBottomSheet: React.FC<InfoBottomSheetProps> = ({ isOpen, onClose }) => {
  const [isVisible, setIsVisible] = useState(isOpen);
  const translateY = useSharedValue(0);

  // Sync internal state with prop to allow exit animations
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      translateY.value = 0;
    } else {
      // Allow parent to close, but we handle the Modal visibility after animation usually.
      // However, Modal `visible` prop is hard toggle. 
      // If we want animation, we must keep Modal visible until animation finishes.
      // But for simplicity in this integration, if parent says close, we close.
      // To improve, we would perform an exit animation here then setIsVisible(false).
      setIsVisible(false);
    }
  }, [isOpen]);

  const closeSheet = useCallback(() => {
    'worklet';
    runOnJS(onClose)();
  }, [onClose]);

  const gesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100 || event.velocityY > 500) {
        // Swipe Down / Fast Swipe -> Close
        translateY.value = withTiming(height, { duration: 250 }, () => {
           runOnJS(onClose)();
        });
      } else {
        // Snap back
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  if (!isVisible && !isOpen) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      statusBarTranslucent
      animationType="none" // We handle animation
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        
        {/* Background Dim (Fade In/Out) */}
        {/* We use specific entering/exiting on the background */}
        <Animated.View 
            entering={FadeIn} 
            exiting={FadeOut}
            style={StyleSheet.absoluteFill}
        >
            <TouchableOpacity 
                style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} 
                activeOpacity={1} 
                onPress={onClose}
            />
        </Animated.View>

        {/* Bottom Sheet Content (Slide In/Out) */}
        <GestureDetector gesture={gesture}>
            <Animated.View 
                entering={SlideInDown.duration(400).easing(Easing.out(Easing.cubic))} 
                exiting={SlideOutDown}
                style={[styles.sheetContainer, animatedStyle]}
            >
            {/* Handle Bar */}
            <View style={styles.handleBar} />

            <View style={styles.contentContainer}>
                {/* Title & Description */}
                <Text style={styles.title}>진행하기 전</Text>
                <Text style={styles.description}>
                이미지처럼 음식을 사진으로 찍거나 업로드해 주세요.{'\n'}
                사진 촬영 시에는 음식이 보조 박스 안에 들어오도록 해주세요.
                </Text>

                {/* Example Grid */}
                <View style={styles.gridContainer}>
                
                {/* Good Example */}
                <View style={styles.exampleItem}>
                    <View style={styles.imageWrapper}>
                    <View style={styles.imageContainer}>
                        <Image 
                            source={require('../assets/images/guide-good.jpg')} 
                            style={styles.exampleImage}
                            resizeMode="cover"
                        />
                    </View>
                    <View style={styles.badgeContainer}>
                        <CheckCircle2 color="#22c55e" size={32} fill="#ecfdf5" />
                    </View>
                    </View>
                    <Text style={styles.label}>좋은 사진 예시</Text>
                </View>

                {/* Bad Example */}
                <View style={styles.exampleItem}>
                    <View style={styles.imageWrapper}>
                    <View style={styles.imageContainer}>
                        <Image 
                            source={require('../assets/images/guide-bad.jpg')} 
                            style={[styles.exampleImage, { opacity: 0.5 }]} 
                            resizeMode="cover"
                        />
                    </View>
                    <View style={styles.badgeContainer}>
                        <XCircle color="#ef4444" size={32} fill="#fef2f2" />
                    </View>
                    </View>
                    <Text style={styles.label}>좋지 않은 사진 예시</Text>
                </View>

                </View>
                
                {/* Footer Button */}
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 32,
    paddingBottom: 48,
    width: '100%',
    alignItems: 'center',
  },
  handleBar: {
    width: 48,
    height: 6,
    backgroundColor: '#E4E4E7', // zinc-200
    borderRadius: 999,
    marginBottom: 32,
  },
  contentContainer: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: 'black',
  },
  description: {
    color: '#71717A', // zinc-500
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 40,
    textAlign: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 40,
    width: '100%',
    maxWidth: 400,
    justifyContent: 'center',
  },
  exampleItem: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 160,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    marginBottom: 12,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#F4F4F5', 
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  exampleImage: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: -10, 
    left: '50%',
    transform: [{ translateX: -16 }],
    backgroundColor: 'white',
    borderRadius: 999,
    padding: 0, 
    shadowColor: "#000",
    shadowOffset: {
        width: 0,
        height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#52525B', 
    marginTop: 8,
  },
  button: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#18181B', 
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  }
});
