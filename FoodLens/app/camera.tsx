import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking, Image } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { analyzeImage } from '../services/ai';
import { dataStore } from '../services/dataStore';
import { getLocationData, getEmoji, validateCoordinates } from '../services/utils';
import AnalysisLoadingScreen from '../components/AnalysisLoadingScreen';



import { useNetworkStatus } from '../hooks/useNetworkStatus';

export default function CameraScreen() {
  // === ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS ===
  const [permission, requestPermission] = ImagePicker.useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const router = useRouter();
  const isCancelled = useRef(false);
  const hasLaunched = useRef(false);
  const cachedLocation = useRef<any>(undefined);
  const { imageUri: externalImageUri, photoLat, photoLng, sourceType } = useLocalSearchParams<{  
    imageUri?: string;
    photoLat?: string;
    photoLng?: string;
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
        
        const fallbackLocation = {
          latitude: lat,
          longitude: lng,
          country: null,
          city: null,
          district: "",
          subregion: "",
          isoCountryCode: undefined,
          formattedAddress: "",
        };

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


  const handleCancelAnalysis = useCallback(() => {
    isCancelled.current = true;
    setIsAnalyzing(false);
    setCapturedImage(null);
    router.replace('/');
  }, [router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isCancelled.current = true;
    };
  }, []);

  const processImage = useCallback(async (uri: string) => {
    try {
      isCancelled.current = false;
      setIsAnalyzing(true);
      setCapturedImage(uri);
      
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
          setIsAnalyzing(false);
          setCapturedImage(null);
          router.replace('/');
          return;
      }

      const isoCode = locationData?.isoCountryCode || "US";
      console.log("Analyzing with Country Code:", isoCode);

      // 2. Analyze Image
      const analysisResult = await analyzeImage(uri, isoCode);
      
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
      if (isCancelled.current) return;
      
      console.error(error);
      setIsAnalyzing(false);
      setCapturedImage(null);
      
      const errorMessage = error?.message?.toLowerCase() || '';
      
      // Server 5xx Error (Retryable)
      // "Server returned status 500" from ai.ts
      if (errorMessage.includes('status 5') || errorMessage.includes('status 500')) {
          Alert.alert(
              "서버 오류",
              "일시적인 서버 문제가 발생했습니다.\n다시 시도하시겠습니까?",
              [
                  { text: '취소', style: 'cancel', onPress: () => router.replace('/') },
                  { 
                      text: '재시도', 
                      onPress: () => {
                          // Simple retry: call processImage again with the same URI
                          if (uri) processImage(uri);
                      } 
                  }
              ]
          );
          return; // Stay on screen if retrying
      }

      const isFileError = errorMessage.includes('file') || 
                          errorMessage.includes('read') || 
                          errorMessage.includes('access') ||
                          errorMessage.includes('permission') ||
                          errorMessage.includes('corrupt');
      
      if (isFileError) {
        Alert.alert("파일 오류", "이미지 파일을 불러올 수 없습니다. 다른 사진을 선택해주세요.");
      } else {
        // Generic or Network Error
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
      
      {/* 
        Phase 1: Location Check (permission dialog might show here)
        Phase 2: Analysis Process 
      */}
      {!isLocationReady ? (
        <View style={styles.launchingTextContainer}>
          <Text style={styles.launchingText}>Checking Location...</Text>
        </View>
      ) : isAnalyzing ? (
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
