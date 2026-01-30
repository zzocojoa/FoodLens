import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, Image } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { analyzeImage } from '../services/ai';
import { dataStore } from '../services/dataStore';
import { getLocationData } from '../services/utils';
import AnalysisLoadingScreen from '../components/AnalysisLoadingScreen';



export default function CameraScreen() {
  // === ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS ===
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const router = useRouter();
  const isCancelled = useRef(false);
  const hasLaunched = useRef(false);
  const cachedLocation = useRef<any>(null);
  const { imageUri: externalImageUri } = useLocalSearchParams<{ imageUri?: string }>();

  // Proactively request camera permission on mount
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);



  // Prefetch location on mount to reduce shutter lag
  useEffect(() => {
    getLocationData().then(data => {
        if (data) {
            console.log("Location prefetched:", data.isoCountryCode);
            cachedLocation.current = data;
        }
    });

    // If an image was passed from Home, start processing immediately
    if (externalImageUri) {
        processImage(externalImageUri);
    }
  }, [getLocationData, externalImageUri]);

  const handleCancelAnalysis = useCallback(() => {
    isCancelled.current = true;
    setIsAnalyzing(false);
    setCapturedImage(null);
    router.replace('/');
  }, [router]);

  const processImage = useCallback(async (uri: string) => {
    try {
      isCancelled.current = false;
      setIsAnalyzing(true);
      setCapturedImage(uri);
      
      // 1. Get Location Context (Use Cache if available)
      let locationData = cachedLocation.current;

      if (!locationData) {
          console.log("Location cache miss, fetching now...");
          try {
              locationData = await getLocationData(); // 5s timeout baked in
          } catch (e) {
              console.warn("Location fetch failed, defaulting to US context", e);
          }
      } else {
          console.log("Using prefetched location");
      }
      
      if (isCancelled.current) return;
      
      const isoCode = locationData?.isoCountryCode || "US";
      console.log("Analyzing with Country Code:", isoCode);

      // 2. Analyze Image
      const analysisResult = await analyzeImage(uri, isoCode);
      
      if (isCancelled.current) return;

      if (isCancelled.current) return;

      // Use DataStore to prevent URL parameter overflow
      dataStore.setData(analysisResult, locationData, uri);

      router.replace({
        pathname: '/result',
        params: { fromStore: 'true', isNew: 'true' }
      });
      
      setIsAnalyzing(false);
      setCapturedImage(null);
    } catch (error: any) {
      console.error(error);
      setIsAnalyzing(false);
      setCapturedImage(null);
      
      const errorMessage = error?.message?.toLowerCase() || '';
      const isFileError = errorMessage.includes('file') || 
                          errorMessage.includes('read') || 
                          errorMessage.includes('access') ||
                          errorMessage.includes('permission') ||
                          errorMessage.includes('corrupt');
      
      if (isFileError) {
        Alert.alert("파일 오류", "이미지 파일을 불러올 수 없습니다. 다른 사진을 선택해주세요.");
      } else {
        Alert.alert("분석 실패", "서버 연결에 문제가 있습니다. 네트워크를 확인하고 다시 시도해주세요.");
      }
      
      router.replace('/');
    }
  }, [router, getLocationData]);

  // No longer auto-launching camera from here to prevent flickering. 
  // This screen now acts purely as an analysis processing gateway.

  // Reset launch flag (kept for potential internal state tracking if needed)
  useEffect(() => {
    return () => {
      hasLaunched.current = false;
    };
  }, []);

  // === CONDITIONAL RENDERING (not early returns) ===

  // Loading State - permission not yet loaded
  if (!permission) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
      </View>
    );
  }

  // Denied State (Only block if we need to launch the camera and don't have an image)
  if (permission && !permission.granted && !externalImageUri) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ textAlign: 'center', marginBottom: 20, fontSize: 18, color: 'white' }}>
          Camera Access Required
        </Text>
        <TouchableOpacity 
            onPress={() => Linking.openSettings()}
            style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Normal render - permission granted
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <Image 
        source={{ uri: "https://images.unsplash.com/photo-1495195134817-aeb325a55b65?q=80&w=2676&auto=format&fit=crop" }} 
        style={StyleSheet.absoluteFillObject} 
        blurRadius={20}
      />
      <View style={styles.darkOverlay} />
      
      {/* Acts as a processing screen when an image is provided from Home */}
      {isAnalyzing ? (
        <AnalysisLoadingScreen 
          onCancel={handleCancelAnalysis} 
          imageUri={capturedImage || undefined}
        />
      ) : (
        <View style={styles.launchingTextContainer}>
          <Text style={styles.launchingText}>Preparing Analysis...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  permissionButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  launchingTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  launchingText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.8,
  }
});
