import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Modal, Image as RNImage, Dimensions, Linking, Animated, Easing } from 'react-native';
import { CameraView, CameraType, FlashMode, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Info, X, Image as ImageIcon, ScanBarcode, Zap, ZapOff, ZoomIn, Search, RotateCcw } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';

import { analyzeImage, analyzeLabel, lookupBarcode, AnalyzedData, NutritionData } from '../../services/ai';
import { dataStore } from '../../services/dataStore';
import { 
    getEmoji, 
    normalizeTimestamp, 
    getLocationData,
    validateCoordinates,
    extractLocationFromExif 
} from '../../services/utils';
import { UserService } from '../../services/userService';
import AnalysisLoadingScreen from '../../components/AnalysisLoadingScreen';
import { InfoBottomSheet } from '../../components/InfoBottomSheet';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

// --- Constants & Types ---
type CameraMode = 'LABEL' | 'FOOD' | 'BARCODE';

const MODES: { id: CameraMode; label: string }[] = [
  { id: 'LABEL', label: '라벨' },
  { id: 'FOOD', label: '사진' },
  { id: 'BARCODE', label: '바코드' },
];

const TEST_UID = "test-user-v1";

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
  const router = useRouter();
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);

  // --- State ---
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<CameraMode>('FOOD');
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState(0); 
  
  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined);
  const [activeStep, setActiveStep] = useState<number | undefined>(undefined);
  const [scanned, setScanned] = useState(false); // Barcode lock
  const [showInfoSheet, setShowInfoSheet] = useState(false);

  const isCancelled = useRef(false);
  const isProcessingRef = useRef(false); // Lock for barcode scanning
  const cachedLocation = useRef<any>(undefined);

  // Network Guard
  const { isConnected } = useNetworkStatus();
  const isConnectedRef = useRef(true);
  
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
      setScanned(false);
      isProcessingRef.current = false; // Reset lock when mode changes
  }, [mode]);

  // --- Animation for Barcode Laser ---
  const laserAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode === 'BARCODE') {
        const startAnimation = () => {
            laserAnim.setValue(0);
            Animated.loop(
                Animated.sequence([
                    Animated.timing(laserAnim, {
                        toValue: 1,
                        duration: 1500, // Reduced slightly for better pacing
                        easing: Easing.inOut(Easing.ease), // Slow start/end, fast middle
                        useNativeDriver: true,
                    }),
                    Animated.timing(laserAnim, {
                        toValue: 0,
                        duration: 1500,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    })
                ])
            ).start();
        };
        startAnimation();
    } else {
        laserAnim.stopAnimation();
        laserAnim.setValue(0);
    }
  }, [mode]);

  // --- Helpers ---
  const toggleFlash = () => {
    setFlash(current => {
        if (current === 'off') return 'on';
        if (current === 'on') return 'auto';
        return 'off';
    });
    Haptics.selectionAsync();
  };

  const toggleZoom = () => {
    setZoom(current => current === 0 ? 0.05 : 0); // Toggle roughly 1x / 2x
    Haptics.selectionAsync();
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
    Haptics.selectionAsync();
  };

  const handleClose = () => {
    if (isAnalyzing) {
        handleCancelAnalysis();
    } else {
        router.back();
    }
  };

  const resetState = useCallback(() => {
    setIsAnalyzing(false);
    setCapturedImage(null);
    setUploadProgress(undefined);
    setActiveStep(undefined);
    setScanned(false); 
    isProcessingRef.current = false; // Unlock
  }, []);

  const handleCancelAnalysis = useCallback(() => {
    isCancelled.current = true;
    resetState();
  }, [resetState]);

  // Centralized Error Handler
  const handleError = useCallback((error: any) => {
    console.error(error);
    resetState();
    
    const errorMessage = error?.message?.toLowerCase() || '';
    
    // Server 5xx Error (Retryable)
    if (errorMessage.includes('status 5') || errorMessage.includes('status 500')) {
        Alert.alert("서버 오류", "일시적인 서버 문제가 발생했습니다.");
    } else {
        Alert.alert("분석 실패", "문제가 발생했습니다. 다시 시도해주세요.");
    }
  }, [resetState]);

  // --- CORE: Process Barcode ---
  const processBarcode = useCallback(async (barcode: string) => {
    try {
      setIsAnalyzing(true);
      setActiveStep(0); // Scanning...
      
      if (!isConnectedRef.current) {
          Alert.alert("오프라인", "인터넷 연결을 확인해주세요.");
          resetState();
          return;
      }

      console.log("Looking up barcode via service:", barcode);
      const result = await lookupBarcode(barcode);
      
      if (result.found && result.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          const product = result.data;
          
          // Map Ingredients (String[] -> Object[]) if they are strings
          if (product.ingredients && product.ingredients.length > 0 && typeof product.ingredients[0] === 'string') {
              product.ingredients = (product.ingredients as any).map((ing: string) => ({
                  name: ing,
                  isAllergen: false,
              }));
          }

          // Location & Timestamp
          const locationData = cachedLocation.current || createFallbackLocation(0,0,"US");
          const finalTimestamp = new Date().toISOString();

          // Save & Navigate
          dataStore.setData(product, locationData, (product.raw_data as any)?.image_url || null, finalTimestamp); 

          router.replace({
               pathname: '/result',
               params: { fromStore: 'true', isNew: 'true' }
          });
          
          resetState();

      } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setIsAnalyzing(false); 
          
          Alert.alert(
              "제품 정보 없음",
              "등록되지 않은 바코드입니다.\n사진으로 성분표를 분석하시겠습니까?",
              [
                  { text: '취소', style: 'cancel', onPress: () => { setScanned(false); isProcessingRef.current = false; } }, 
                  { 
                      text: '촬영하기', 
                      onPress: () => {
                          setMode('LABEL'); // Switched to LABEL for OCR
                          setScanned(false);
                          isProcessingRef.current = false;
                      }
                  }
              ]
          );
      }

    } catch (e: any) {
        console.error("Barcode Error:", e);
        Alert.alert("오류", "바코드 조회 중 문제가 발생했습니다.");
        resetState();
    }
  }, [isConnectedRef, resetState, router]);

  const handleBarcodeScanned = useCallback((scanningResult: BarcodeScanningResult) => {
      // Check lock (isProcessingRef) immediately
      if (mode !== 'BARCODE' || scanned || isAnalyzing || isProcessingRef.current) return;
      
      isProcessingRef.current = true; // Lock immediately
      setScanned(true);
      processBarcode(scanningResult.data);
  }, [mode, scanned, isAnalyzing, processBarcode]);


  // --- CORE: Process Image (Analysis) ---
  const processImage = useCallback(async (uri: string, customSourceType: 'camera' | 'library' = 'camera', customTimestamp?: string | null, customLocation?: any) => {
    try {
      isCancelled.current = false;
      setIsAnalyzing(true);
      setCapturedImage(uri);
      setActiveStep(0); // Image Ready

      // 1. Get Location Context
      // Priority: Custom (EXIF) -> Cached -> Current
      let locationData = customLocation || cachedLocation.current;
      
      if (!locationData) {
          try {
             locationData = await getLocationData(); // Try fetch
             if (locationData) cachedLocation.current = locationData;
          } catch (e) {
             console.warn("Location fetch failed", e);
          }
      }

      if (isCancelled.current) return;

      // Network Check
      if (!isConnectedRef.current) {
          Alert.alert("오프라인", "인터넷 연결을 확인해주세요.");
          resetState();
          return;
      }

      let isoCode = locationData?.isoCountryCode || "US";

      // 2. Validate File
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists || (fileInfo as any).size === 0) {
          throw new Error("File validation failed: Image is empty or missing.");
      }

      // 3. Analyze Image
      setActiveStep(1); // Uploading
      setUploadProgress(0);

      const analysisResult = await analyzeImage(uri, isoCode, (progress) => {
          if (!isCancelled.current) {
              setUploadProgress(progress);
              if (progress >= 1) setActiveStep(2); // Analyzing
          }
      });
      
      if (isCancelled.current) return;

      // 4. Sync Results
      setActiveStep(3); 

      // Prepare context
      const locationContext = locationData || createFallbackLocation(0, 0, isoCode, "Location Unavailable");
      const finalTimestamp = normalizeTimestamp(customTimestamp); // Use EXIF if available, else Now

      dataStore.setData(analysisResult, locationContext, uri, finalTimestamp);

      // Navigate
      router.replace({
        pathname: '/result',
        params: { fromStore: 'true', isNew: 'true' }
      });
      
      resetState();

    } catch (error: any) {
      if (isCancelled.current) return;
      handleError(error);
    }
  }, [router, handleError, resetState]);


  // --- CORE: Process Label (OCR) ---
  const processLabel = useCallback(async (uri: string, customTimestamp?: string | null) => {
    try {
      isCancelled.current = false;
      setIsAnalyzing(true);
      setCapturedImage(uri);
      setActiveStep(0); // Image Ready

      if (!isConnectedRef.current) {
          Alert.alert("오프라인", "인터넷 연결을 확인해주세요.");
          resetState();
          return;
      }

      // Context
      let locationData = cachedLocation.current || await getLocationData().catch(() => null);
      let isoCode = locationData?.isoCountryCode || "US";

      setActiveStep(1); // Uploading
      setUploadProgress(0);

      const analysisResult = await analyzeLabel(uri, isoCode, (progress) => {
          if (!isCancelled.current) {
              setUploadProgress(progress);
              if (progress >= 1) setActiveStep(2); // Analyzing
          }
      });

      if (isCancelled.current) return;

      // Sync & Navigate
      setActiveStep(3);
      const finalTimestamp = normalizeTimestamp(customTimestamp);
      dataStore.setData(analysisResult, locationData || createFallbackLocation(0,0,isoCode), uri, finalTimestamp);

      router.replace({
        pathname: '/result',
        params: { fromStore: 'true', isNew: 'true' }
      });
      
      resetState();

    } catch (error: any) {
      if (isCancelled.current) return;
      handleError(error);
    }
  }, [router, handleError, resetState]);


  // --- Actions ---
  const handleCapture = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (cameraRef.current) {
        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.5,
                base64: false, // Don't need base64 for upload usually, uri is fine
                exif: true,
            });
            
            if (photo && photo.uri) {
                // Extract EXIF Timestamp
                const exifDate = photo.exif?.DateTimeOriginal || photo.exif?.DateTime || null;

                if (mode === 'BARCODE') {
                      Alert.alert("알림", "바코드를 카메라에 비춰주세요.");
                } else if (mode === 'LABEL') {
                    processLabel(photo.uri, exifDate);
                } else {
                    processImage(photo.uri, 'camera', exifDate);
                }
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "촬영에 실패했습니다.");
        }
    }
  };



// ... (imports)

// Inside component
  const handleGallery = async () => {
    Haptics.selectionAsync();
    
    try {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            allowsEditing: true, 
            quality: 0.8,
            exif: true, // Request EXIF data
        });

        if (!result.canceled && result.assets[0].uri) {
             const asset = result.assets[0];
             const uri = asset.uri;
             
             console.log("[Gallery] Asset selected:", asset.uri);
             console.log("[Gallery] EXIF Data:", JSON.stringify(asset.exif, null, 2));

             // 1. Try EXIF Timestamp
             let finalDate = asset.exif?.DateTimeOriginal || asset.exif?.DateTime || null;
             console.log("[Gallery] EXIF Date:", finalDate);
             
             // 2. Try EXIF Location
             let exifLocation = null;
             try {
                exifLocation = await extractLocationFromExif(asset.exif);
                if (exifLocation) {
                    console.log("[Gallery] EXIF Location found:", exifLocation.formattedAddress);
                } else {
                    console.log("[Gallery] No EXIF GPS data found.");
                }
             } catch (e) {
                console.warn("[Gallery] Failed to parse EXIF location:", e);
             }

             // 2. Fallback to MediaLibrary (System Metadata) if EXIF is missing
             if (!finalDate && asset.assetId) {
                 console.log("[Gallery] EXIF missing, trying MediaLibrary for assetId:", asset.assetId);
                 try {
                     const permission = await MediaLibrary.requestPermissionsAsync();
                     if (permission.granted) {
                         const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
                         if (info && info.creationTime) {
                             // creationTime is usually milliseconds or timestamp
                             finalDate = new Date(info.creationTime).toISOString();
                             console.log("[Gallery] MediaLibrary CreationTime:", finalDate);
                         }
                         
                         // Double check location from MediaLibrary if not found in EXIF
                         if (!exifLocation && info.location) {
                            // Note: MediaLibrary location format might differ, keeping it simple for now
                            // Usually has latitude/longitude
                             if (info.location.latitude && info.location.longitude) {
                                 // Re-use logic or manual construct
                                 // For now, let's stick to the main EXIF path as it's more robust with reverse geocode
                                 // But we can try to reverse geocode this too if needed.
                                 // For now, MVP:
                                 const valid = validateCoordinates(info.location.latitude, info.location.longitude);
                                 if (valid) {
                                     // Quick reverse geocode call if we really want to support this path
                                     // For now, leaving as null to fall back to current location is safer than bad data
                                     // or implement fully later.
                                 }
                             }
                         }
                     }
                 } catch (e) {
                     console.warn("[Gallery] MediaLibrary lookup failed:", e);
                 }
             }

             if (mode === 'LABEL') {
                 processLabel(uri, finalDate);
             } else {
                 processImage(uri, 'library', finalDate, exifLocation);
             }
        }
    } catch (e) {
        console.error(e);
        Alert.alert("Error", "갤러리를 열 수 없습니다.");
    }
  };

  // --- Permission Handling ---
  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>카메라 접근 권한이 필요합니다.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>권한 허용하기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <X size={24} color="white" />
        </TouchableOpacity>
      </View>
    );
  }

  // --- Render ---
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <InfoBottomSheet 
        isOpen={showInfoSheet} 
        onClose={() => setShowInfoSheet(false)} 
      />
      {/* 0. Loading Overlay */}
      {isAnalyzing && (
         <View style={[StyleSheet.absoluteFill, { zIndex: 100 }]}>
            <AnalysisLoadingScreen 
                onCancel={handleCancelAnalysis}
                imageUri={capturedImage || ""}
                manualStep={activeStep ?? 0}
                manualProgress={uploadProgress}
            />
         </View>
      )}

      {/* 1. Camera View */}
      {isFocused && (
          <CameraView 
            style={StyleSheet.absoluteFill} 
            facing={facing}
            flash={flash}
            zoom={zoom}
            ref={cameraRef}
            onBarcodeScanned={mode === 'BARCODE' ? handleBarcodeScanned : undefined}
            barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "qr"], 
            }}
          />
      )}

      {/* 2. Overlays & Gradients */}
      <View style={styles.overlay} pointerEvents="none">
         <View style={styles.viewfinderContainer}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
            
            {/* Barcode Laser Line */}
            {mode === 'BARCODE' && (
                <Animated.View 
                    style={[
                        styles.laserContainer, 
                        {
                            transform: [{
                                translateY: laserAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0, 240]
                                })
                            }]
                        }
                    ]} 
                >
                    <LinearGradient
                        colors={[
                            'rgba(255, 59, 48, 0)',   // Transparent Start
                            'rgba(255, 59, 48, 0.8)', // Red
                            'rgba(255, 255, 255, 1)', // White Hot Core
                            'rgba(255, 59, 48, 0.8)', // Red
                            'rgba(255, 59, 48, 0)'    // Transparent End
                        ]}
                        start={{ x: 0, y: 0.5 }} 
                        end={{ x: 1, y: 0.5 }}
                        locations={[0, 0.2, 0.5, 0.8, 1]}
                        style={styles.premiumLaser}
                    />
                </Animated.View>
            )}

            {/* Guide Text based on Mode */}
            <Text style={styles.guideText}>
                {mode === 'FOOD' ? '음식을 중앙에 맞춰주세요' : 
                 mode === 'LABEL' ? '영양성분표를 가득 차게 찍어주세요' : 
                 '바코드를 스캔하세요'}
            </Text>
         </View>
      </View>

      {/* 3. Top Controls */}
      <View style={styles.topBar}>
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => setShowInfoSheet(true)}
        >
            <Info size={24} color="white" />
        </TouchableOpacity>
        
        <View style={styles.topCenterControls}>
            <TouchableOpacity onPress={toggleFlash} style={styles.iconButton}>
                {flash === 'on' ? <Zap size={24} color="#FBBF24" fill="#FBBF24" /> : 
                 flash === 'auto' ? <Zap size={24} color="white" /> : 
                 <ZapOff size={24} color="white" />}
            </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleClose} style={styles.iconButton}>
            <X size={28} color="white" />
        </TouchableOpacity>
      </View>

      {/* 4. Bottom Controls */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)', 'black']}
        style={styles.bottomBar}
      >
        <View style={styles.contextControls}>
            <TouchableOpacity onPress={toggleZoom} style={styles.zoomButton}>
                <ZoomIn size={20} color="white" />
                <Text style={styles.zoomText}>{zoom === 0 ? '1x' : '2x'}</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.shutterRow}>
            <TouchableOpacity onPress={handleGallery} style={styles.galleryButton}>
                <ImageIcon size={24} color="white" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleCapture} style={styles.shutterButton} activeOpacity={0.8}>
                <View style={[styles.shutterInner, mode === 'BARCODE' && styles.shutterInnerBarcode]} />
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleCameraFacing} style={styles.galleryButton}>
                <RotateCcw size={24} color="white" />
            </TouchableOpacity> 
        </View>

        <View style={styles.modeSelector}>
            {MODES.map((m) => (
                <TouchableOpacity 
                    key={m.id} 
                    onPress={() => {
                        setMode(m.id);
                        Haptics.selectionAsync();
                    }}
                    style={[styles.modeChip, mode === m.id && styles.modeChipActive]}
                >
                    <Text style={[styles.modeText, mode === m.id && styles.modeTextActive]}>
                        {m.label}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>

      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    color: 'white',
    fontSize: 16,
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    padding: 10,
  },
  
  // Top Bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    zIndex: 10,
  },
  topCenterControls: {
    flexDirection: 'row',
    gap: 20,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },

  // Overlays
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderContainer: {
    width: 280,
    height: 280,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'white',
    borderWidth: 4,
  },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 20 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 20 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 20 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 20 },

  laserContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40, // Container for shadow
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  premiumLaser: {
      width: '100%',
      height: 3, // Core thickness
      shadowColor: '#FF3B30', // System Red (Bright)
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 8, // Strong glow
      elevation: 5, // Android glow
  },

  // Darken areas (Not implemented fully for complexity, just simple overlay usually)
  // For now, let's keep it simple with just frame
  darkenTop: { position: 'absolute', top: -1000, left: -1000, right: -1000, height: 1000, backgroundColor: 'rgba(0,0,0,0.4)' },
  darkenBottom: { position: 'absolute', bottom: -1000, left: -1000, right: -1000, height: 1000, backgroundColor: 'rgba(0,0,0,0.4)' },
  darkenLeft: { position: 'absolute', top: 0, bottom: 0, left: -1000, width: 1000, backgroundColor: 'rgba(0,0,0,0.4)' },
  darkenRight: { position: 'absolute', top: 0, bottom: 0, right: -1000, width: 1000, backgroundColor: 'rgba(0,0,0,0.4)' },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingTop: 40,
    alignItems: 'center',
    gap: 20,
  },
  contextControls: {
    flexDirection: 'row',
    gap: 40,
    marginBottom: 10,
  },
  zoomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(50,50,50,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  zoomText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(50,50,50,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 40,
  },
  galleryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 5,
    borderColor: 'white',
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: '100%',
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 40,
  },
  shutterInnerBarcode: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'white',
  },

  modeSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 30,
    padding: 4,
    gap: 4,
  },
  modeChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  modeChipActive: {
    backgroundColor: '#3F3F46', // Zinc-700
  },
  modeText: {
    color: '#71717A', // Zinc-500
    fontWeight: '600',
    fontSize: 14,
  },
  modeTextActive: {
    color: 'white',
  },
  guideText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
