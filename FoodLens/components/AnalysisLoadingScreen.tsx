import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  withSequence,
  Easing,
  interpolate,
  Extrapolation
} from 'react-native-reanimated';
import { Sparkles, X, AlertTriangle } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

interface AnalysisLoadingScreenProps {
  onCancel: () => void;
  isError?: boolean;
  imageUri?: string;
  manualStep?: number;
  manualProgress?: number;
}

const AnalysisLoadingScreen: React.FC<AnalysisLoadingScreenProps> = ({ 
  onCancel, 
  isError = false, 
  imageUri,
  manualStep,
  manualProgress
}) => {
  const [step, setStep] = useState(0);
  const steps = ["Image Ready", "Uploading", "AI Analyzing", "Syncing Results"];
  
  // Animation Values
  const rotation = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const rippleScale = useSharedValue(1);
  const rippleOpacity = useSharedValue(0.8);

  const isManual = typeof manualStep === 'number';

  useEffect(() => {
    // 1. Orbit Rotation
    rotation.value = withRepeat(
      withTiming(360, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );

    // 2. Pulse Effect
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // 3. Ripple Effect
    rippleScale.value = withRepeat(
      withTiming(4, { duration: 3000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    rippleOpacity.value = withRepeat(
      withTiming(0, { duration: 3000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );

    // 4. Step Progression Logic (Only if not manual)
    if (!isManual) {
        const interval = setInterval(() => {
            setStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
        }, 1500);
        return () => clearInterval(interval);
    }
  }, [isManual]); // Re-run if switching mode (unlikely but safe)

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }]
  }));

  // Counter-rotating inner orbit (opposite direction)
  const orbitInnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `-${rotation.value}deg` }]
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }]
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rippleScale.value }],
    opacity: rippleOpacity.value
  }));

  const themeColor = isError ? '#EF4444' : '#3B82F6'; // Red for Error, Blue for Normal

  // Determine what to show
  const currentStep = isManual && manualStep !== undefined ? manualStep : step;
  
  // Unified Color Logic
  const colors = {
      primary: isError ? '#EF4444' : '#3B82F6',
      orbit: isError ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)',
      orbitInner: isError ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)',
      ripple: isError ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)',
      hub: isError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)',
      icon: isError ? '#EF4444' : '#3B82F6'
  };

  // Progress Calculation Helper
  const getProgressWidth = () => {
      if (!isManual || manualProgress === undefined) {
          return isError ? '100%' : `${((currentStep + 1) / steps.length) * 100}%`;
      }
      
      if (currentStep === 1) { // Uploading (10% -> 60% range concept)
          const startOffset = 0.25; 
          const uploadRange = 0.5;   
          const calculated = startOffset + (manualProgress * uploadRange);
          return `${Math.min(calculated * 100, 75)}%`;
      } 
      
      if (currentStep > 1) {
          return currentStep === 2 ? '85%' : '100%';
      }
      
      return '10%'; // Step 0
  };

  const progressWidth = getProgressWidth();

  // Long wait feedback
  const [isLongWait, setIsLongWait] = useState(false);
  
  // Reset long wait when step changes
  useEffect(() => {
      setIsLongWait(false);
      let timer: any;
      
      if (currentStep === 2) { // AI Analyzing Phase
          timer = setTimeout(() => {
              setIsLongWait(true);
          }, 8000); // 8 seconds threshold
      }
      
      return () => clearTimeout(timer);
  }, [currentStep]);

  return (
    <View style={styles.container}>
      {/* Ambient Background */}
      <View style={styles.backgroundLayer}>
        <Image 
          source={{ uri: imageUri || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=1000&auto=format&fit=crop" }} 
          style={styles.backgroundImage} 
          blurRadius={90}
        />
        <View style={styles.darkOverlay} />
      </View>

      {/* Center Core */}
      <View style={styles.coreContainer}>
        {/* Orbit Rings */}
        <Animated.View style={[styles.orbitRing, orbitStyle, { borderColor: colors.orbit }]} />
        <Animated.View style={[styles.orbitRingInner, orbitInnerStyle, { borderColor: colors.orbitInner }]} />
        
        {/* Ripple */}
        <Animated.View style={[styles.ripple, rippleStyle, { borderColor: colors.ripple }]} />
        
        {/* Main Hub */}
        <Animated.View style={[styles.hub, pulseStyle, { borderColor: colors.hub }]}>
            <BlurView intensity={40} tint="dark" style={styles.hubBlur}>
                <View style={styles.iconCircle}>
                    {isError ? (
                        <AlertTriangle size={24} color={colors.icon} fill={colors.icon} />
                    ) : (
                        <Sparkles size={24} color={colors.icon} fill={colors.icon} />
                    )}
                </View>
            </BlurView>
        </Animated.View>
      </View>

      {/* HUD Overlay */}
      <View style={styles.hudContainer}>
        <View style={styles.statusBadge}>
            <Text style={styles.statusText}>NEURAL CORE {isError ? 'ERROR' : 'ACTIVE'}</Text>
        </View>

        <View style={{flex: 1}} />

        {/* Status Message */}
        <View style={styles.messageArea}>
            <Text style={styles.mainMessage}>
                {isError ? "ANALYSIS FAILED" : (isLongWait && currentStep === 2 ? "SERVER WARMING UP..." : steps[currentStep])}
            </Text>
            
            {!isError && (
                <View style={styles.loadingDots}>
                    <View style={styles.dot} />
                    <View style={[styles.dot, {opacity: 0.6}]} />
                    <View style={[styles.dot, {opacity: 0.3}]} />
                </View>
            )}

            {/* Progress Bar */}
            <View style={styles.progressBarBg}>
                <Animated.View 
                    style={[
                        styles.progressBarFill, 
                        { 
                            width: progressWidth as any,
                            backgroundColor: colors.primary
                        }
                    ]} 
                />
            </View>
        </View>


      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    backgroundColor: 'black',
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.85)', // slate-950
  },
  coreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitRing: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  orbitRingInner: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderStyle: 'dotted',
  },
  ripple: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
  },
  hub: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  hubBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'white',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  hudContainer: {
    position: 'absolute',
    top: 60,
    bottom: 50,
    alignItems: 'center',
    width: '100%',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statusText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  messageArea: {
    alignItems: 'center',
    width: '80%',
    marginBottom: 60,
  },
  mainMessage: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  loadingDots: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 20,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#60A5FA', // blue-400
  },
  progressBarBg: {
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
  },
  cancelButton: {
    alignItems: 'center',
    gap: 12,
  },
  cancelIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
});

export default AnalysisLoadingScreen;
