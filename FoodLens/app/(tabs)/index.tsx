import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Dimensions, Alert, Linking, Animated, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, User, Bell, Settings, ShieldCheck, Heart, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions } from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';

const { width } = Dimensions.get('window');

// 2026 Design Tokens
import { THEME } from '../../constants/theme';
import { getEmoji, formatDate } from '../../services/utils';

import { useFocusEffect } from '@react-navigation/native';
import { AnalysisService, AnalysisRecord } from '../../services/analysisService';
import { UserService } from '../../services/userService';
import { dataStore } from '../../services/dataStore';
import { ServerConfig } from '../../services/ai';

export default function HomeScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isPressed, setIsPressed] = useState(false);
  const [recentScans, setRecentScans] = useState<AnalysisRecord[]>([]);
  const [allergyCount, setAllergyCount] = useState(0);
  const [safeCount, setSafeCount] = useState(0); 
  const [serverModalVisible, setServerModalVisible] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState('');
  const TEST_UID = "test-user-v1";

  useFocusEffect(
    React.useCallback(() => {
        loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
        const [recentData, allHistory, userProfile] = await Promise.all([
            AnalysisService.getRecentAnalyses(TEST_UID, 3), 
            AnalysisService.getAllAnalyses(TEST_UID),       
            UserService.getUserProfile(TEST_UID)
        ]);
        
        setRecentScans(recentData);

        const safeItems = allHistory.filter(item => item.safetyStatus === 'SAFE').length;
        setSafeCount(safeItems);

        if (userProfile && userProfile.safetyProfile) {
            const count = (userProfile.safetyProfile.allergies?.length || 0) + 
                          (userProfile.safetyProfile.dietaryRestrictions?.length || 0);
            setAllergyCount(count);
        }
    } catch (e) {
        console.error(e);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
        // Optimistic UI update
        setRecentScans(prev => prev.filter(item => item.id !== itemId));
        
        await AnalysisService.deleteAnalysis(TEST_UID, itemId);
        loadDashboardData(); // Refresh counts
    } catch (error) {
        console.error("Home delete failed:", error);
        Alert.alert("Error", "Could not delete item.");
        loadDashboardData(); // Revert on error
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
            <Animated.View style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]}>
                <Trash2 size={24} color="white" />
                <Text style={styles.deleteText}>Delete</Text>
            </Animated.View>
        </TouchableOpacity>
    );
  };



  const handleSaveServer = async () => {
    if (!newServerUrl.trim()) {
        Alert.alert("Error", "Please enter a valid URL.");
        return;
    }
    await ServerConfig.setServerUrl(newServerUrl.trim());
    setServerModalVisible(false);
    Alert.alert("Success", "Server URL updated successfully.");
  };

  const openServerSettings = async () => {
    const currentUrl = await ServerConfig.getServerUrl();
    setNewServerUrl(currentUrl);
    setServerModalVisible(true);
  };

  const handleStartAnalysis = async () => {
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

  const performImageSelection = async (type: 'camera' | 'library') => {
    try {
      let result;
      if (type === 'camera') {
        // 1. Check Permissions
        if (permission && !permission.granted && !permission.canAskAgain) {
          Alert.alert(
            "Camera Permission Needed",
            "Please enable camera access in settings to analyze food.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() }
            ]
          );
          return;
        }

        if (permission && !permission.granted) {
          const res = await requestPermission();
          if (!res.granted) return;
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          quality: 0.5,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          quality: 0.5,
        });
      }

      if (!result.canceled && result.assets[0].uri) {
        // 3. Navigate to camera screen with the image ready to analyze
        router.push({
          pathname: '/camera',
          params: { imageUri: result.assets[0].uri }
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
        <ScrollView 
          contentContainerStyle={{paddingBottom: 150, paddingHorizontal: 24}} 
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              <View style={styles.avatarContainer}>
                 <Image 
                    source={{ uri: "https://api.dicebear.com/7.x/avataaars/png?seed=Felix" }} 
                    style={styles.avatar}
                 />
              </View>
              <View>
                <Text style={styles.welcomeText}>Welcome back,</Text>
                <Text style={styles.userName}>Traveler Joy ✈️</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.bellButton} onPress={openServerSettings}>
              <View pointerEvents="none">
                 <Settings size={20} color="#475569" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Hero Section */}
          <View style={[styles.heroCard, THEME.glass]}>
             <View style={styles.heroGlow} />
             <Text style={styles.heroEmoji}>🍎</Text>
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
                          <Text style={{fontSize: 24}}>{getEmoji(item.foodName)}</Text>
                        </View>
                        <View>
                          <Text style={styles.scanName}>{item.foodName}</Text>
                          <Text style={styles.scanDate}>{formatDate(item.timestamp)}</Text>
                        </View>
                     </View>
                     <View style={[styles.badge, item.safetyStatus === 'SAFE' ? styles.badgeSafe : (item.safetyStatus === 'DANGER' ? styles.badgeDanger : {backgroundColor: '#FEF3C7'})]}>
                       <Text style={[styles.badgeText, item.safetyStatus === 'SAFE' ? {color: '#15803D'} : (item.safetyStatus === 'DANGER' ? {color: '#BE123C'} : {color: '#B45309'})]}>
                         {item.safetyStatus}
                       </Text>
                     </View>
                  </TouchableOpacity>
                </Swipeable>
              </View>
            ))}
            {recentScans.length === 0 && (
                <Text style={{textAlign: 'center', color: '#94A3B8', marginTop: 10}}>No recent scans yet.</Text>
            )}
          </View>

        </ScrollView>

        {/* Server Settings Modal */}
        <Modal
            animationType="slide"
            transparent={true}
            visible={serverModalVisible}
            onRequestClose={() => setServerModalVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <BlurView intensity={100} tint="light" style={styles.modalContainer}>
                    <Text style={styles.modalTitle}>Server Configuration</Text>
                    <Text style={styles.modalSubtitle}>Enter your cloud or local server URL</Text>
                    
                    <TextInput
                        style={styles.serverInput}
                        placeholder="https://your-server.render.com"
                        value={newServerUrl}
                        onChangeText={setNewServerUrl}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    
                    <View style={styles.modalButtons}>
                        <TouchableOpacity 
                            style={[styles.modalButton, styles.cancelButton]} 
                            onPress={() => setServerModalVisible(false)}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={[styles.modalButton, styles.saveButton]} 
                            onPress={handleSaveServer}
                        >
                            <LinearGradient
                                colors={['#3B82F6', '#2563EB']}
                                style={styles.saveButtonGradient}
                            >
                                <Text style={styles.saveButtonText}>Save URL</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </BlurView>
            </View>
        </Modal>
      </SafeAreaView>

      {/* Floating Action Area (Bottom) */}
      <View style={styles.floatingContainer}>
        <BlurView intensity={90} tint="light" style={styles.floatingDock}>
           {/* Start Analysis Button */}
           <TouchableOpacity 
              activeOpacity={0.9}
              onPress={handleStartAnalysis}
              onPressIn={() => setIsPressed(true)}
              onPressOut={() => setIsPressed(false)}
              style={{width: '100%', marginBottom: 12}}
           >
             <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                style={[styles.mainButton, isPressed && {transform: [{scale: 0.98}]}]}
                pointerEvents="none"
             >
                <View style={styles.mainBtnIconCircle}>
                   <Camera size={24} color="white" fill="white" />
                </View>
                <Text style={styles.mainButtonText}>Start Analysis</Text>
             </LinearGradient>
           </TouchableOpacity>

           {/* Secondary Buttons Row */}
           <View style={styles.secondaryRow}>
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={() => router.push('/profile')}
              >
                 <View pointerEvents="none" style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                    <User size={18} color="#334155" />
                    <Text style={styles.secondaryButtonText}>Manage Profile</Text>
                 </View>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.iconButton}>
                 <View pointerEvents="none">
                    <Settings size={20} color="#334155" />
                 </View>
              </TouchableOpacity>
           </View>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
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
