import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Dimensions, Alert, Linking, Animated, Modal, TextInput, InteractionManager, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, User, Bell, Settings, ShieldCheck, Heart, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions } from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { usePermissionGuard } from '../../hooks/usePermissionGuard';

import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
// @ts-ignore
import piexif from 'piexifjs';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const { width } = Dimensions.get('window');

// 2026 Design Tokens
// 2026 Design Tokens
import { THEME } from '../../constants/theme';
import { getEmoji, formatDate, validateCoordinates, getLocationData, decimalToDMS } from '../../services/utils';
import { SecureImage } from '../../components/SecureImage';
import SpatialApple from '../../components/SpatialApple';

import { useFocusEffect } from '@react-navigation/native';
import { AnalysisService, AnalysisRecord } from '../../services/analysisService';
import { UserService } from '../../services/userService';
import { dataStore } from '../../services/dataStore';
import { ServerConfig } from '../../services/ai';
import { UserProfile } from '../../models/User';
import ProfileSheet from '../../components/ProfileSheet';
import { FoodThumbnail } from '../../components/FoodThumbnail'; // NEW
import { HapticsService } from '../../services/haptics';


export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [isPressed, setIsPressed] = useState(false);
  const [recentScans, setRecentScans] = useState<AnalysisRecord[]>([]);
  const [allergyCount, setAllergyCount] = useState(0);
  const [safeCount, setSafeCount] = useState(0); 
  // Unified Modal State
  type ModalType = 'NONE' | 'PROFILE'; // Removed 'SERVER'
  const [activeModal, setActiveModal] = useState<ModalType>('NONE');
  
  // const [serverModalVisible, setServerModalVisible] = useState(false); // Replaced
  // const [newServerUrl, setNewServerUrl] = useState(''); // Removed newServerUrl state
  // const [isProfileOpen, setIsProfileOpen] = useState(false); // Replaced
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const TEST_UID = "test-user-v1";

  // Camera Orb Animation
  const orbAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    Animated.spring(orbAnim, {
        toValue: activeModal === 'PROFILE' ? 0 : 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40
    }).start();
  }, [activeModal]);

  useFocusEffect(
    React.useCallback(() => {
        // Prevent stutter by waiting for transitions to finish
        const task = InteractionManager.runAfterInteractions(() => {
            loadDashboardData();
        });
        return () => task.cancel();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
        const [recentData, allHistory, userProfile] = await Promise.all([
            AnalysisService.getRecentAnalyses(TEST_UID, 3), 
            AnalysisService.getAllAnalyses(TEST_UID),       
            UserService.getUserProfile(TEST_UID)
        ]);
        
        console.log(`[Dashboard] Loaded: ${allHistory.length} total items from storage`);
        
        setRecentScans(recentData);

        const safeItems = allHistory.filter(item => item.safetyStatus === 'SAFE').length;
        setSafeCount(safeItems);

        if (userProfile) {
            setUserProfile(userProfile); // <--- Add this line
            const count = (userProfile.safetyProfile.allergies?.length || 0) + 
                          (userProfile.safetyProfile.dietaryRestrictions?.length || 0);
            setAllergyCount(count);
        }
    } catch (e) {
        console.error(e);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const previousScans = [...recentScans]; // 1. Backup state

    try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        // 2. Optimistic Update (Immediate UI Feeback)
        setRecentScans(prev => prev.filter(item => item.id !== itemId));
        
        // 3. Perform Actual Deletion
        await AnalysisService.deleteAnalysis(TEST_UID, itemId);
        
        // Background refresh for other stats (counts)
        loadDashboardData(); 
    } catch (error) {
        console.error("Home delete failed:", error);
        
        // 4. Rollback on Failure
        setRecentScans(previousScans);
        Alert.alert("Error", "Failed to delete item. Restoring data.");
    }
  };

  const renderRightActions = (progress: any, dragX: any, onClick: () => void) => {
    const trans = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [0, 80],
        extrapolate: 'clamp',
    });
    return (
        <TouchableOpacity onPress={onClick} style={styles.deleteAction}>
            <Animated.View 
                style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]}
                pointerEvents="none"
            >
                <Trash2 size={24} color="white" />
                <Text style={styles.deleteText}>Delete</Text>
            </Animated.View>
        </TouchableOpacity>
    );
  };


  const getBadgeStyle = (status: string) => {
      switch (status) {
          case 'SAFE':
              return { container: styles.badgeSafe, text: { color: '#15803D' } };
          case 'DANGER':
              return { container: styles.badgeDanger, text: { color: '#BE123C' } };
          default:
              return { container: { backgroundColor: '#FEF3C7' }, text: { color: '#B45309' } };
      }
  };

  // Removed handleSaveServer function
  // Removed openServerSettings function

  const handleStartAnalysis = async () => {
    /* NEW: Network Guard */
    HapticsService.tickTick();
    if (isConnected === false) {
      Alert.alert(
        "Offline Mode",
        "Internet connection is required to analyze new food items. Please check your connection."
      );
      return;
    }

    Alert.alert(
      "Analyze Food",
      "Choose a photo to analyze",
      [
        {
          text: "Take Photo",
          onPress: () => performImageSelection('camera')
        },
        {
          text: "Choose from Library",
          onPress: () => performImageSelection('library')
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  /* 
   * NEW: Integrated Permission Guard 
   * Handles Camera and Gallery permissions with settings redirection
   */
  const { checkAndRequest } = usePermissionGuard();

  const { isConnected } = useNetworkStatus();

  const performImageSelection = async (type: 'camera' | 'library') => {
    try {
      let result;
      let hasPermission = false;

      const permissionType = type === 'camera' ? 'camera' : 'mediaLibrary';
      const granted = await checkAndRequest(permissionType);
      if (!granted) return;

      if (type === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          quality: 0.5,
        });

        // Save to gallery if capture was successful
        if (!result.canceled && result.assets[0].uri) {
          let finalUri = result.assets[0].uri;
          
          try {
              // 1. Attempt to get location (with timeout and permission check)
              // If this fails/times out, we just skip GPS injection
              const loc = await getLocationData();
              
              if (loc) {
                  console.log("Injecting GPS data into gallery image...");
                  const base64 = await FileSystem.readAsStringAsync(finalUri, { encoding: FileSystem.EncodingType.Base64 });
                  
                  // Load EXIF
                  const exifObj = piexif.load("data:image/jpeg;base64," + base64);
                  
                  // Initialize GPS IFD if not present
                  if (!exifObj["GPS"]) {
                      exifObj["GPS"] = {};
                  }
                  
                  const gps = exifObj["GPS"];
                  const latDMS = decimalToDMS(loc.latitude);
                  const lngDMS = decimalToDMS(loc.longitude);
                  
                  // Set GPS Tags
                  gps[piexif.GPSIFD.GPSLatitudeRef] = loc.latitude < 0 ? 'S' : 'N';
                  gps[piexif.GPSIFD.GPSLatitude] = latDMS;
                  gps[piexif.GPSIFD.GPSLongitudeRef] = loc.longitude < 0 ? 'W' : 'E';
                  gps[piexif.GPSIFD.GPSLongitude] = lngDMS;

                  // Dump and Insert
                  const exifBytes = piexif.dump(exifObj);
                  const newBase64 = piexif.insert(exifBytes, "data:image/jpeg;base64," + base64);
                  
                  // Save modified image to temp file
                  // piexif.insert returns data uri, we need to strip prefix
                  const strippedBase64 = newBase64.replace(/^data:image\/[a-z]+;base64,/, "");
                  
                  const tempUri = FileSystem.cacheDirectory + `temp_gps_${Date.now()}.jpg`;
                  await FileSystem.writeAsStringAsync(tempUri, strippedBase64, { encoding: FileSystem.EncodingType.Base64 });
                  
                  finalUri = tempUri; // Update URI to point to the one with GPS
              }
          } catch (e) {
              // Handle Error Types 1, 2, 3, 4 gracefully
              // We log but continue to save the original photo
              console.warn("GPS Injection failed (saving original):", e);
          }

          try {
            await MediaLibrary.saveToLibraryAsync(finalUri);
            
            // Clean up temp file if we created one
            if (finalUri !== result.assets[0].uri) {
                await FileSystem.deleteAsync(finalUri, { idempotent: true });
            }
          } catch (e) {
            // Handle Error Type 5: Gallery Save Failure
            console.error("Failed to save food photo to gallery:", e);
            Alert.alert("Gallery Error", "Could not save photo to gallery. Please check permissions.");
          }
        }
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          quality: 0.5,
          exif: true,
          // Force local file copy for iCloud assets to prevent file access errors
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        });
      }

      if (!result.canceled && result.assets[0].uri) {
        const asset = result.assets[0];
        let photoLatitude: number | undefined;
        let photoLongitude: number | undefined;
        
        if (asset.exif) {
          const exif = asset.exif as any;
          // Robust check: Validate coordinates range and existence
          // Some devices use 'Latitude', others 'GPSLatitude'
          const latCandidate = exif.GPSLatitude ?? exif.Latitude;
          const lngCandidate = exif.GPSLongitude ?? exif.Longitude;

          const valid = validateCoordinates(latCandidate, lngCandidate);
          if (valid) {
            photoLatitude = valid.latitude;
            photoLongitude = valid.longitude;
          }
        }

        router.push({
          pathname: '/camera',
          params: { 
            imageUri: asset.uri,
            photoLat: photoLatitude?.toString(),
            photoLng: photoLongitude?.toString(),
            sourceType: type
          }
        });
      }
    } catch (e) {
      console.error(`${type} launch failed:`, e);
      Alert.alert("Error", `Failed to launch ${type}.`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Background */}
      <View style={styles.backgroundContainer}>
      </View>

      <SafeAreaView style={{flex: 1}}>
        <StatusBar style="light" />

        {/* NEW: Offline Banner */}
        {isConnected === false && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>Offline Mode: Using cached data</Text>
          </View>
        )}
        <ScrollView 
          contentContainerStyle={{paddingBottom: 150, paddingHorizontal: 24}} 
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable 
                onPress={() => {
                    HapticsService.medium();
                    setActiveModal('PROFILE');
                }} 
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                hitSlop={20}
            >
                <View style={styles.userInfo}>
                <View style={styles.avatarContainer} pointerEvents="none">
                    <SecureImage 
                        source={{ uri: userProfile?.profileImage || "https://api.dicebear.com/7.x/avataaars/png?seed=Felix" }} 
                        style={styles.avatar}
                        fallbackIconSize={20}
                    />
                </View>
                <View pointerEvents="none">
                    <Text style={styles.welcomeText}>Welcome back,</Text>
                    <Text style={styles.userName}>{userProfile?.name || "Traveler Joy"} ✈️</Text>
                </View>
                </View>
            </Pressable>
          </View>
          
          {/* ... existing Hero and Stats ... */}
          {/* Hero Section */}
           <View style={[styles.heroCard, THEME.glass]}>
              <View style={styles.heroGlow} />
              <View style={styles.heroEmoji}>
                  <SpatialApple size={100} />
              </View>
              <Text style={styles.heroTitle}>Food Lens</Text>
              <Text style={styles.heroSubtitle}>Travel Safe, Eat Smart</Text>
           </View>

          {/* Bento Grid Stats */}
          <View style={styles.statsGrid}>
            <TouchableOpacity 
                activeOpacity={0.8}
                style={{flex: 1}}
                onPress={() => router.push('/trip-stats')}
            >
                <BlurView intensity={80} tint="light" style={styles.statCard} pointerEvents="none">
                    <View style={[styles.statIconBox, { backgroundColor: '#DCFCE7' }]}>
                        <ShieldCheck size={22} color="#166534" />
                    </View>
                    <Text style={styles.statLabel}>Safe Items</Text>
                    <Text style={styles.statValue}>{safeCount}</Text>
                </BlurView>
            </TouchableOpacity>
            
            <BlurView intensity={80} tint="light" style={styles.statCard}>
              <View style={[styles.statIconBox, { backgroundColor: '#FFE4E6' }]}>
                <Heart size={22} color="#E11D48" />
              </View>
              <Text style={styles.statLabel}>Allergies</Text>
              <Text style={styles.statValue}>{allergyCount}</Text>
            </BlurView>
          </View>

          {/* Recent Scans */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Scans</Text>
            <TouchableOpacity onPress={() => router.push('/history')}>
               <View pointerEvents="none">
                 <Text style={styles.seeAllText}>See All</Text>
               </View>
            </TouchableOpacity>
          </View>

          <View style={styles.scanList}>
            {recentScans.map((item, index) => (
              <View key={`${item.id}-${index}`} style={{ marginBottom: 12 }}>
                <Swipeable
                    renderRightActions={(progress, dragX) => 
                        renderRightActions(progress, dragX, () => handleDeleteItem(item.id))
                    }
                >
                  <TouchableOpacity
                      style={[styles.scanItem, { marginBottom: 0 }]} // Remove marginBottom from item to let View handle it
                      activeOpacity={0.7}
                      onPress={() => {
                          dataStore.setData(item, item.location, item.imageUri || "");
                          router.push({ pathname: '/result', params: { fromStore: 'true' } });
                      }}
                  >
                     <View style={styles.scanInfo}>
                        <View style={styles.scanEmojiBox}>
                          <FoodThumbnail 
                              uri={item.imageUri}
                              emoji={getEmoji(item.foodName)}
                              style={{width: '100%', height: '100%', borderRadius: 16, backgroundColor: 'transparent'}}
                              imageStyle={{borderRadius: 12}}
                              fallbackFontSize={24}
                          />
                        </View>
                        <View>
                          <Text style={styles.scanName}>{item.foodName}</Text>
                          <Text style={styles.scanDate}>{formatDate(item.timestamp)}</Text>
                        </View>
                     </View>
                     
                     {(() => {
                        const badgeStyle = getBadgeStyle(item.safetyStatus);
                        return (
                            <View style={[styles.badge, badgeStyle.container]}>
                                <Text style={[styles.badgeText, badgeStyle.text]}>
                                    {item.safetyStatus}
                                </Text>
                            </View>
                        );
                     })()}
                  </TouchableOpacity>
                </Swipeable>
              </View>
            ))}
            {recentScans.length === 0 && (
                <Text style={{textAlign: 'center', color: '#94A3B8', marginTop: 10}}>No recent scans yet.</Text>
            )}
          </View>

        </ScrollView>

        {/* Profile Sheet */}
        <ProfileSheet 
            isOpen={activeModal === 'PROFILE'} 
            onClose={() => setActiveModal('NONE')}
            userId={TEST_UID}
            onUpdate={loadDashboardData}
        />

      </SafeAreaView>

      {/* Camera Action Button */}
      <Animated.View 
        style={[
            styles.orbContainer,
            { 
                opacity: orbAnim,
                transform: [{ scale: orbAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }]
            }
        ]}
        pointerEvents={activeModal === 'PROFILE' ? 'none' : 'box-none'}
      >
         <TouchableOpacity 
            onPress={handleStartAnalysis}
            activeOpacity={0.8}
            style={styles.cameraButtonShadow}
         >
            <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                style={styles.cameraButton}
                pointerEvents="none"
            >
                <Camera color="white" size={32} />
            </LinearGradient>
         </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  orbContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    pointerEvents: 'box-none',
  },
  cameraButtonShadow: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  cameraButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  offlineBanner: {
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  offlineText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },

  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    borderWidth: 2,
    borderColor: 'white',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
  },
  avatar: {
    width: 48,
    height: 48,
  },
  welcomeText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  userName: {
    fontSize: 18,
    color: '#0F172A',
    fontWeight: '700',
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9', 
  },
  heroCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(96, 165, 250, 0.2)', // blue-400
  },
  heroEmoji: {
    fontSize: 64,
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: {width: 0, height: 4},
    textShadowRadius: 8,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    padding: 20,
    borderRadius: 28,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  scanList: {
    gap: 12,
  },
  scanItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    padding: 16,
    borderRadius: 24,
  },
  scanInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scanEmojiBox: {
    width: 48,
    height: 48,
    backgroundColor: 'white',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
  },
  scanName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  scanDate: {
    fontSize: 12,
    color: '#94A3B8',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  badgeSafe: {
    backgroundColor: '#DCFCE7', // green-100
  },
  badgeDanger: {
    backgroundColor: '#FFE4E6', // rose-100
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  floatingContainer: {
    position: 'absolute',
    bottom: 30,
    left: 24,
    right: 24,
  },
  floatingDock: {
    padding: 16,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: {width: 0, height: 10},
    shadowRadius: 20,
    elevation: 20,
  },
  mainButton: {
    width: '100%',
    height: 72,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  mainBtnIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    height: 64,
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 14,
  },
  iconButton: {
    width: 64,
    height: 64,
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 80,
    height: '100%',
    borderRadius: 24,
  },
  deleteBtnContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
    height: '100%',
  },
  deleteText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    borderRadius: 32,
    padding: 32,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 24,
  },
  serverInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  saveButton: {
    // Gradient handles this
  },
  saveButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 16,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
});
