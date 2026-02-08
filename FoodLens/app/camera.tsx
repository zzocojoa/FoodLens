import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, Image } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { analyzeImage } from '../services/ai';
import { dataStore } from '../services/dataStore';
import { getLocationData, getEmoji, validateCoordinates, normalizeTimestamp } from '../services/utils';
import { UserService } from '../services/userService';
import AnalysisLoadingScreen from '../components/AnalysisLoadingScreen';



import { useNetworkStatus } from '../hooks/useNetworkStatus';

// Helper: Create standardized location object
const createFallbackLocation = (lat: number, lng: number, isoCode?: string, address: string = "") => ({
  latitude: lat,
  longitude: lng,
  country: null,
  city: null,
  district: "",
  subregion: "",
  isoCountryCode: isoCode,
  formattedAddress: address,
});

export default function CameraScreen() {
  const TEST_UID = "test-user-v1";
  // === ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS ===
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const router = useRouter();
  const isCancelled = useRef(false);
  const hasLaunched = useRef(false);
  const cachedLocation = useRef<any>(undefined);
  const { imageUri: externalImageUri, photoLat, photoLng, photoTimestamp, sourceType } = useLocalSearchParams<{  
    imageUri?: string;
    photoLat?: string;
    photoLng?: string;
    photoTimestamp?: string;
    sourceType?: 'camera' | 'library';
  }>();

  // Network Guard
  const { isConnected } = useNetworkStatus();
  const isConnectedRef = useRef(true);
  
  useEffect(() => {
      isConnectedRef.current = isConnected;
  }, [isConnected]);

  // State for location initialization phase
  const [isLocationReady, setIsLocationReady] = useState(false);

  // Proactively request camera permission on mount
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  // Guard: If permission granted but no image provided, exit
  useEffect(() => {
    if (permission?.granted && !externalImageUri) {
        // Short delay to avoid race conditions with mount
        const timer = setTimeout(() => {
            Alert.alert("오류", "이미지 정보를 불러올 수 없습니다. 다시 시도해주세요.");
            router.replace('/');
        }, 500);
        return () => clearTimeout(timer);
    }
  }, [permission, externalImageUri]);



  // Prefetch location on mount to reduce shutter lag
  useEffect(() => {
    const initLocation = async () => {
      // 1. If photo has GPS data from EXIF (Library), use that
      // 1. If photo has GPS data from EXIF (Library), use that
      if (photoLat && photoLng) {
        // Validate coordinates to prevent NaN or invalid range
        const validCoords = validateCoordinates(photoLat, photoLng);
        
        if (validCoords) {
          const { latitude: lat, longitude: lng } = validCoords;
          console.log("Using photo EXIF GPS:", lat, lng);
        
        const fallbackLocation = createFallbackLocation(lat, lng);

        // Reverse geocode the photo location
        try {
          const Location = await import('expo-location');
          const reverseGeocode = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          
          if (reverseGeocode.length > 0) {
            const place = reverseGeocode[0];
            
            // Extract detailed address fields
            const country = place.country || "Unknown";
            const city = place.city || place.region || "Unknown";
            const district = place.district || place.subregion || "";
            const subregion = place.name || place.street || "";
            
            // Build formatted address (most specific to least specific)
            const addressParts = [subregion, district, city, country];
            const uniqueParts = Array.from(new Set(addressParts.filter(part => part && part !== "Unknown")));
            const formattedAddress = uniqueParts.join(', ');
            
            cachedLocation.current = {
              ...fallbackLocation,
              country,
              city,
              district,
              subregion,
              isoCountryCode: place.isoCountryCode || undefined,
              formattedAddress,
            };
            console.log("Photo location set:", formattedAddress);
          } else {
            // Fallback if reverse geocode returns empty
            cachedLocation.current = fallbackLocation;
          }
        } catch (e) {
          console.warn("Reverse geocode for photo failed", e);
          // Still set the coordinates even if reverse geocode fails
          cachedLocation.current = fallbackLocation;
        }
      } else {
          console.warn("Invalid EXIF coordinates provided:", photoLat, photoLng);
          // Fallback to current location or no location logic below
          // But to keep it simple, we treat invalid EXIF as "no location info in photo"
          // However, logic below (else if sourceType === 'camera') handles the rest.
          // If sourceType is library and invalid EXIF, it falls to the 'else' block below (null location).
      }
      } else if (sourceType === 'camera') {
        // 2. Camera Capture: Always fetch current device location
        // This will trigger permission dialog if needed
        const data = await getLocationData();
        if (data) {
          console.log("Camera photo - using current location:", data.isoCountryCode);
          cachedLocation.current = data;
        } else {
          // Warning for Permission Denial or Timeout
          // We don't block analysis, but we inform the user
          // Using a non-intrusive log or toast would be better, but Alert is requested/safer for now
          // We'll use a short timeout to not block the UI render too abruptly
          setTimeout(() => {
              Alert.alert(
                  "위치 정보 없음", 
                  "위치 권한이 없거나 가져올 수 없습니다. 위치 기반 알러지 필터가 적용되지 않을 수 있습니다."
              );
          }, 500);
        }
      } else {
        // 3. Library photo without GPS - explicitly no location
        console.log("Library photo without GPS - no location data");
        cachedLocation.current = null;
      }

      // Mark location phase as done
      setIsLocationReady(true);

      // IMPORTANT: Only process image AFTER location is fully set
      if (externalImageUri) {
        processImage(externalImageUri);
      }
    };

    initLocation();
  }, [externalImageUri, photoLat, photoLng, sourceType]);


  // Helper: Reset all analysis state
  const resetState = useCallback(() => {
    setIsAnalyzing(false);
    setCapturedImage(null);
    setUploadProgress(undefined);
    setActiveStep(undefined);
  }, []);

  const handleCancelAnalysis = useCallback(() => {
    isCancelled.current = true;
    resetState();
    router.replace('/');
  }, [router, resetState]);

  // Helper: Centralized Error Handler
  const handleError = useCallback((error: any, uri: string) => {
      console.error(error);
      resetState();
      
      const errorMessage = error?.message?.toLowerCase() || '';
      
      // Server 5xx Error (Retryable)
      if (errorMessage.includes('status 5') || errorMessage.includes('status 500')) {
          Alert.alert(
              "서버 오류",
              "일시적인 서버 문제가 발생했습니다.\n다시 시도하시겠습니까?",
              [
                  { text: '취소', style: 'cancel', onPress: () => router.replace('/') },
                  { 
                      text: '재시도', 
                      onPress: () => {
                          if (uri) processImage(uri);
                      } 
                  }
              ]
          );
          return; 
      }

      const isFileError = errorMessage.includes('file') || 
                          errorMessage.includes('read') || 
                          errorMessage.includes('access') ||
                          errorMessage.includes('permission') ||
                          errorMessage.includes('corrupt') ||
                          errorMessage.includes('validation');
      
      if (isFileError) {
        Alert.alert("파일 오류", "이미지 파일을 불러올 수 없습니다. 다른 사진을 선택해주세요.");
      } else {
        Alert.alert("분석 실패", "서버 연결에 문제가 있습니다. 네트워크를 확인하고 다시 시도해주세요.");
      }
      
      router.replace('/');
  }, [router, resetState]); // processImage dependency is cyclic if added directly, but loop is safely broken by user action

  // Progress State
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined);
  const [activeStep, setActiveStep] = useState<number | undefined>(undefined);

  const processImage = useCallback(async (uri: string) => {
    try {
      isCancelled.current = false;
      setIsAnalyzing(true);
      setCapturedImage(uri);
      
      // Step 0: Image Ready / Location Context
      setActiveStep(0);

      // 1. Get Location Context (Use Cache if available)
      let locationData = cachedLocation.current;

      if (locationData === undefined) {
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
      
      // Network Check
      if (!isConnectedRef.current) {
          Alert.alert("오프라인", "인터넷 연결을 확인해주세요.");
          resetState();
          router.replace('/');
          return;
      }

      let isoCode = locationData?.isoCountryCode;

      if (!isoCode) {
          console.log("No location code, checking user preference...");
          try {
              const user = await UserService.getUserProfile(TEST_UID);
              if (user && user.settings.targetLanguage) {
                  isoCode = user.settings.targetLanguage;
                  console.log("Using User Preferred Language:", isoCode);
              }
          } catch (e) {
              console.warn("Failed to load user preference for language fallback", e);
          }
      }
      
      isoCode = isoCode || "US"; // Final fallback
      console.log("Analyzing with Country Code:", isoCode);

      // Validation: Check file before upload
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists || (fileInfo as any).size === 0) {
          throw new Error("File validation failed: Image is empty or missing.");
      }

      // 2. Analyze Image
      // Transition to Step 1: Uploading
      setActiveStep(1); // Uploading
      setUploadProgress(0);

      const analysisResult = await analyzeImage(uri, isoCode, (progress) => {
          if (!isCancelled.current) {
              setUploadProgress(progress);
              if (progress >= 1) {
                  // Upload complete, now waiting for server (AI Analyzing)
                  setActiveStep(2); 
              }
          }
      });
      
      if (isCancelled.current) return;

      // Analysis complete
      setActiveStep(3); // Syncing Results

      // Prepare location data for store (use fallback if real location missing)
      const locationContext = locationData || createFallbackLocation(
          0, 
          0, 
          isoCode, 
          "Location Unavailable (Using Preference)"
      );

      // Prepare timestamp
      // Normalize whatever we get (EXIF string, ISO string, or undefined) to a valid ISO string
      const finalTimestamp = normalizeTimestamp(photoTimestamp);

      // Use DataStore to prevent URL parameter overflow
      dataStore.setData(analysisResult, locationContext, uri, finalTimestamp);

      router.replace({
        pathname: '/result',
        params: { fromStore: 'true', isNew: 'true' }
      });
      
      resetState();

    } catch (error: any) {
      if (isCancelled.current) return;
      handleError(error, uri);
    }
  }, [router, getLocationData, resetState, handleError]);

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
      
      {/* 
        Phase 1: Location Check (permission dialog might show here)
        Phase 2: Analysis Process 
      */}
      {/* 
        Show Loading Screen Immediately if we have an image
        This prevents the "black screen" flash while waiting for location/permissions
      */}
      {externalImageUri ? (
        <AnalysisLoadingScreen 
          onCancel={handleCancelAnalysis} 
          imageUri={capturedImage || externalImageUri}
          manualStep={activeStep ?? 0}
          manualProgress={uploadProgress}
        />
      ) : !isLocationReady ? null : (
        <View style={styles.launchingTextContainer}>
          <Text style={styles.launchingText}>Preparing Camera...</Text>
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
