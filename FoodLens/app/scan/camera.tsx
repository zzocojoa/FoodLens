import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Modal, Image as RNImage, Dimensions, Linking } from 'react-native';
import { CameraView, CameraType, FlashMode, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Info, X, Image as ImageIcon, ScanBarcode, Zap, ZapOff, ZoomIn, Search } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { analyzeImage, AnalyzedData, NutritionData } from '../../services/ai';
import { dataStore } from '../../services/dataStore';
import { getLocationData, validateCoordinates, normalizeTimestamp } from '../../services/utils';
import { UserService } from '../../services/userService';
import AnalysisLoadingScreen from '../../components/AnalysisLoadingScreen';
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

  const isCancelled = useRef(false);
  const cachedLocation = useRef<any>(undefined);

  // Network Guard
  const { isConnected } = useNetworkStatus();
  const isConnectedRef = useRef(true);
  
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Update Reset on Mode Change
  useEffect(() => {
      setScanned(false);
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
      
      // Network Check
      if (!isConnectedRef.current) {
          Alert.alert("오프라인", "인터넷 연결을 확인해주세요.");
          resetState();
          return;
      }

      console.log("Looking up barcode:", barcode);

      // Call Server
      const formData = new FormData();
      formData.append('barcode', barcode);
      
      // Use Env Var (Local or Prod)
      const API_URL = process.env.EXPO_PUBLIC_ANALYSIS_SERVER_URL || "https://foodlens-2-w1xu.onrender.com"; 
      console.log("Using API_URL:", API_URL); 
      
      const response = await fetch(`${API_URL}/lookup/barcode`, {
          method: 'POST',
          body: formData,
      });

      if (!response.ok) {
          throw new Error(`Server status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.found && result.data) {
          // Success!
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          const product = result.data;
          
          // Map Ingredients (String[] -> Object[])
          const ingredientsList = (product.ingredients || []).map((ing: string) => ({
              name: ing,
              isAllergen: false, // Default, logic to check user allergens could happen here if detailed enough
          }));

          // Map Nutrition
          const nutrition: NutritionData = {
              calories: product.calories || 0,
              protein: product.protein || 0,
              carbs: product.carbs || 0,
              fat: product.fat || 0,
              fiber: 0, 
              sodium: 0,
              sugar: 0,
              servingSize: "1회 제공량",
              dataSource: product.source || "BARCODE",
          };

          // Construct AnalysisResult format matching AnalyzedData interface
          const analysisResult: AnalyzedData = {
              foodName: product.food_name,
              safetyStatus: 'SAFE', // Default for barcode products
              confidence: 1.0, 
              ingredients: ingredientsList,
              nutrition: nutrition,
              raw_result: JSON.stringify(product)
          };

          // Location Context
          const locationData = cachedLocation.current || createFallbackLocation(0,0,"US");
          const finalTimestamp = new Date().toISOString();

          // Save & Navigate
           dataStore.setData(analysisResult, locationData, product.image_url || null, finalTimestamp); 

           router.replace({
                pathname: '/result',
                params: { fromStore: 'true', isNew: 'true' }
           });
           
           resetState();

      } else {
          // Fallback Strategy
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setIsAnalyzing(false); 
          
          Alert.alert(
              "제품 정보 없음",
              "등록되지 않은 바코드입니다.\n사진으로 성분표를 분석하시겠습니까?",
              [
                  { text: '취소', style: 'cancel', onPress: () => setScanned(false) }, 
                  { 
                      text: '촬영하기', 
                      onPress: () => {
                          setMode('FOOD');
                          setScanned(false);
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
      if (mode !== 'BARCODE' || scanned || isAnalyzing) return;
      
      setScanned(true);
      processBarcode(scanningResult.data);
  }, [mode, scanned, isAnalyzing, processBarcode]);


  // --- CORE: Process Image (Analysis) ---
  const processImage = useCallback(async (uri: string, customSourceType: 'camera' | 'library' = 'camera') => {
    try {
      isCancelled.current = false;
      setIsAnalyzing(true);
      setCapturedImage(uri);
      setActiveStep(0); // Image Ready

      // 1. Get Location Context
      let locationData = cachedLocation.current;
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
      const finalTimestamp = new Date().toISOString(); // Or use EXIF if available

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
                if (mode === 'BARCODE') {
                    // Manual Scan Fallback if needed or prompt
                     Alert.alert("알림", "바코드를 카메라에 비춰주세요.");
                } else if (mode === 'LABEL') {
                    // Label Analysis Logic (Future)
                     Alert.alert("알림", "라벨 분석 모드는 준비중입니다. (Food로 분석할까요?)", [
                        { text: '네', onPress: () => processImage(photo.uri) },
                        { text: '아니오', style: 'cancel' }
                     ]);
                } else {
                    // FOOD MODE
                    processImage(photo.uri, 'camera');
                }
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "촬영에 실패했습니다.");
        }
    }
  };

  const handleGallery = async () => {
    Haptics.selectionAsync();
    
    try {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            allowsEditing: true, // Maybe false for smart import? User prefers "detect", cropping might hide key features?
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0].uri) {
             // For now, route directly to FOOD analysis as Smart Import is Phase 3
             processImage(result.assets[0].uri, 'library');
        }
    } catch (e) {
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
        <TouchableOpacity onPress={() => Alert.alert("가이드", "음식: 일반 음식 사진\n라벨: 영양성분표\n바코드: 포장지 바코드")} style={styles.iconButton}>
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

            <View style={styles.galleryButton} /> 
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
