import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput, 
  Modal, ScrollView, Alert, Platform, ActivityIndicator, PanResponder, Animated as RNAnimated,
  Pressable
} from 'react-native';
import { HapticTouchableOpacity } from './HapticFeedback';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { X, Camera, Image as ImageIcon, User, Zap, ChevronRight, Edit3, Globe } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { UserService } from '../services/userService';
import { DEFAULT_AVATARS } from '../models/User';
import { Colors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

interface ProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onUpdate: () => void;
}

const LANGUAGE_OPTIONS = [
    { code: 'GPS', label: 'GPS Location', flag: '📍' },
    { code: 'KR', label: 'Korean', flag: '🇰🇷' },
    { code: 'US', label: 'English', flag: '🇺🇸' },
    { code: 'JP', label: 'Japanese', flag: '🇯🇵' },
    { code: 'CN', label: 'Chinese', flag: '🇨🇳' },
    { code: 'TH', label: 'Thai', flag: '🇹🇭' },
    { code: 'VN', label: 'Vietnamese', flag: '🇻🇳' },
];

const useSheetGesture = (onCloseComplete: () => void) => {
    const panY = React.useRef(new RNAnimated.Value(800)).current;

    const closeSheet = () => {
        RNAnimated.timing(panY, { 
            toValue: 800, 
            duration: 250, 
            useNativeDriver: true 
        }).start(onCloseComplete);
    };

    const openSheet = () => {
        panY.setValue(800);
        RNAnimated.spring(panY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 40 }).start();
    };

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10 && Math.abs(gestureState.dx) < 10,
            onPanResponderMove: (_, gestureState) => gestureState.dy >= 0 && panY.setValue(gestureState.dy),
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) closeSheet();
                else RNAnimated.spring(panY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 40 }).start();
            },
        })
    ).current;

    return { panY, panResponder, openSheet, closeSheet };
};

const MenuItem = ({ icon, title, subtitle, onPress, iconBgColor, theme }: { icon: React.ReactNode, title: string, subtitle: string, onPress?: () => void, iconBgColor: string, theme: any }) => (
    <View style={[styles.menuContainer, {backgroundColor: theme.surface, borderColor: theme.border}]}>
        <HapticTouchableOpacity style={styles.menuItem} onPress={onPress} hapticType="light">
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
                <View style={[styles.iconBox, {backgroundColor: iconBgColor}]}>
                    {icon}
                </View>
                <View>
                    <Text style={[styles.menuTitle, {color: theme.textPrimary}]}>{title}</Text>
                    <Text style={[styles.menuSub, {color: theme.textSecondary}]}>{subtitle}</Text>
                </View>
            </View>
            <ChevronRight size={18} color={theme.textSecondary} />
        </HapticTouchableOpacity>
    </View>
);

const AnimatedThemeToggle = ({ theme, currentTheme, setTheme, colorScheme }: { theme: any, currentTheme: string, setTheme: (t: any) => void, colorScheme: string }) => {
    const [containerWidth, setContainerWidth] = useState(0);
    const translateX = React.useRef(new RNAnimated.Value(0)).current;
    
    // Options
    const options = ['light', 'dark', 'system'] as const;
    const activeIndex = options.indexOf(currentTheme as any);

    useEffect(() => {
        if (containerWidth > 0) {
            const tabWidth = (containerWidth - 8) / 3; // 8 is total padding (4*2)
            RNAnimated.spring(translateX, {
                toValue: activeIndex * tabWidth,
                useNativeDriver: true,
                friction: 7,
                tension: 50
            }).start();
        }
    }, [activeIndex, containerWidth]);

    return (
        <View 
            style={[styles.menuContainer, { 
                backgroundColor: theme.surface, 
                borderColor: theme.border, 
                padding: 4, 
                height: 56, // Fixed height for consistency
                justifyContent: 'center'
            }]}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
            {containerWidth > 0 && (
                <RNAnimated.View 
                    style={{
                        position: 'absolute',
                        left: 4,
                        top: 4,
                        bottom: 4,
                        width: (containerWidth - 8) / 3,
                        backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'white',
                        borderRadius: 24,
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 3,
                        elevation: 2,
                        transform: [{ translateX }]
                    }} 
                />
            )}
            
            <View style={{flexDirection: 'row', flex: 1}}>
                {options.map((t) => {
                    const isActive = currentTheme === t;
                    return (
                        <TouchableOpacity 
                            key={t}
                            onPress={() => setTheme(t)}
                            style={{
                                flex: 1, 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                borderRadius: 24,
                            }}
                            activeOpacity={0.7}
                        >
                            <Text style={{
                                fontSize: 14, 
                                fontWeight: isActive ? '700' : '500', 
                                color: isActive ? theme.textPrimary : theme.textSecondary,
                                textTransform: 'capitalize'
                            }}>
                                {t}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

export default function ProfileSheet({ isOpen, onClose, userId, onUpdate }: ProfileSheetProps) {
  const router = useRouter();
  const { theme: currentTheme, setTheme, colorScheme } = useTheme();
  const theme = Colors[colorScheme];
  const [name, setName] = useState("Traveler Joy");
  const [image, setImage] = useState("https://api.dicebear.com/7.x/avataaars/png?seed=Felix");
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Swipe logic for Main Profile Sheet
  const { 
      panY: panYProfile, 
      panResponder: panResponderProfile, 
      openSheet: openProfile, 
      closeSheet: closeProfile 
  } = useSheetGesture(onClose);

  // Swipe logic for Language Modal
  const { 
      panY, 
      panResponder, 
      openSheet: openLangModal, 
      closeSheet: closeLangModal 
  } = useSheetGesture(() => setLangModalVisible(false));


  // Entrance animations
  useEffect(() => {
    if (isOpen) {
        openProfile();
        loadProfile();
    }
  }, [isOpen]);

  useEffect(() => {
    if (langModalVisible) openLangModal();
  }, [langModalVisible]);

  const loadProfile = async () => {
      const profile = await UserService.getUserProfile(userId);
      if (profile) {
          setName(profile.name || "Traveler Joy");
          setImage(profile.profileImage || "https://api.dicebear.com/7.x/avataaars/png?seed=Felix");
          setLanguage(profile.settings?.targetLanguage);
      }
  };

  const handleUpdate = async () => {
      setLoading(true);
      try {
          await UserService.CreateOrUpdateProfile(userId, "user@example.com", {
              name: name,
              profileImage: image,
              settings: {
                  targetLanguage: language,
                  language: 'en', // default
                  autoPlayAudio: false
              }
          });
          onUpdate(); // Refresh parent
          onClose(); // Close modal
      } catch (e) {
          Alert.alert("Error", "Failed to update profile");
      } finally {
          setLoading(false);
      }
  };

  const pickImage = async (useCamera: boolean) => {
      try {
          let result;
          if (useCamera) {
              const perm = await ImagePicker.requestCameraPermissionsAsync();
              if (!perm.granted) {
                  Alert.alert("Permission Needed", "Camera access is required.");
                  return;
              }
              result = await ImagePicker.launchCameraAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  allowsEditing: true,
                  aspect: [1, 1],
                  quality: 0.5,
              });
          } else {
              result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  allowsEditing: true,
                  aspect: [1, 1],
                  quality: 0.5,
              });
          }

          if (!result.canceled && result.assets[0].uri) {
              const uri = result.assets[0].uri;
              setImage(uri);
              
              // Save to gallery if captured via camera
              if (useCamera) {
                  try {
                      await MediaLibrary.saveToLibraryAsync(uri);
                  } catch (e) {
                      console.error("Failed to save profile photo to gallery:", e);
                  }
              }
          }
      } catch (e) {
          Alert.alert("Error", "Failed to pick image");
      }
  };

  // No early return to ensure closing animation finishes
  // Instead, the View container uses pointerEvents to handle interaction state

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 999999, display: isOpen ? 'flex' : 'none' }]} pointerEvents={isOpen ? 'box-none' : 'none'}>
        {/* Backdrop Overlay - Sibling */}
        <TouchableOpacity 
            activeOpacity={1} 
            style={[styles.overlay, { opacity: isOpen ? 1 : 0 }, StyleSheet.absoluteFill]} 
            onPress={closeProfile}
        />

        {/* Sheet Content - Sibling */}
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
             <RNAnimated.View 
                style={[
                    styles.sheetContainer,
                    { transform: [{ translateY: panYProfile }], backgroundColor: theme.background }
                ]}
             >
                <View {...panResponderProfile.panHandlers} style={styles.swipeHandleWrapper}>
                    <View style={styles.swipeHandle} />
                </View>

                    {/* Header */}
                    <View {...panResponderProfile.panHandlers} style={[styles.header, { justifyContent: 'center' }]}>
                        <Text style={[styles.title, {color: theme.textPrimary}]}>Profile</Text>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 40}}>
                        {/* Part 1: Visual Identity */}
                        <View style={styles.section}>
                            <View style={styles.avatarWrapper}>
                               <View style={[styles.avatarFrame, {backgroundColor: theme.surface, borderColor: theme.surface}]}>
                                   <Image source={{ uri: image }} style={styles.avatarImage} />
                               </View>
                               <HapticTouchableOpacity 
                                    onPress={() => pickImage(true)}
                                    style={[styles.cameraBtn, {backgroundColor: theme.textPrimary, borderColor: theme.background}]}
                                    hapticType="light"
                               >
                                   <Camera size={16} color={theme.background} />
                               </HapticTouchableOpacity>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>DISPLAY NAME</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        value={name}
                                        onChangeText={setName}
                                        style={[styles.textInput, {backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary}]}
                                        placeholder="Enter your name"
                                        placeholderTextColor={theme.textSecondary}
                                    />
                                    <Edit3 size={16} color={theme.textSecondary} style={{position: 'absolute', right: 20}} />
                                </View>
                            </View>

                            {/* Presets */}
                            <View>
                                <Text style={[styles.label, {marginBottom: 12}]}>PRESETS</Text>
                                <View style={styles.presetGrid}>
                                    {DEFAULT_AVATARS.map((url, idx) => (
                                        <HapticTouchableOpacity 
                                            key={idx}
                                            onPress={() => setImage(url)}
                                            style={[
                                                styles.presetItem, 
                                                {backgroundColor: theme.surface, borderColor: 'transparent'},
                                                image === url && {borderColor: theme.primary, backgroundColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF'}
                                            ]}
                                            hapticType="selection"
                                        >
                                            <Image source={{ uri: url }} style={styles.presetImage} />
                                        </HapticTouchableOpacity>
                                    ))}
                                    <HapticTouchableOpacity 
                                        onPress={() => pickImage(false)}
                                        style={[styles.uploadBtn, {backgroundColor: theme.surface, borderColor: theme.border}]}
                                        hapticType="light"
                                    >
                                        <View pointerEvents="none" style={{ alignItems: 'center', gap: 4 }}>
                                            <ImageIcon size={18} color={theme.textSecondary} />
                                            <Text style={styles.uploadText}>Upload</Text>
                                        </View>
                                    </HapticTouchableOpacity>
                                </View>
                            </View>
                        </View>

                        {/* Part 2: Management */}
                        <View style={styles.section}>
                             <AnimatedThemeToggle 
                                theme={theme}
                                currentTheme={currentTheme}
                                setTheme={setTheme}
                                colorScheme={colorScheme}
                             />

                             <MenuItem 
                                icon={<User size={20} color="#2563EB" />}
                                title="Manage Profile"
                                subtitle="Account settings & details"
                                iconBgColor={colorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : "#EFF6FF"}
                                onPress={() => router.push('/profile')}
                                theme={theme}
                             />
                             <MenuItem 
                                icon={<Globe size={20} color="#059669" />}
                                title="Translation Language"
                                subtitle={language ? (LANGUAGE_OPTIONS.find(o => o.code === language)?.label || "Auto (GPS)") : "Auto (GPS)"}
                                iconBgColor={colorScheme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : "#ECFDF5"}
                                onPress={() => setLangModalVisible(true)}
                                theme={theme}
                             />



                             <MenuItem 
                                icon={<Zap size={20} color="#D97706" fill="#D97706" />}
                                title="Remove Ads"
                                subtitle="Premium benefits"
                                iconBgColor={colorScheme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : "#FFFBEB"}
                                theme={theme}
                             />
                        </View>

                        {/* Language Modal */}
                        <Modal
                            visible={langModalVisible}
                            transparent={true}
                            animationType="none"
                            onRequestClose={closeLangModal}
                        >
                             <TouchableOpacity 
                                activeOpacity={1} 
                                style={styles.overlay} 
                                onPress={closeLangModal}
                             >
                                <RNAnimated.View 
                                    style={[
                                        styles.sheetContainer, 
                                        { 
                                            height: '55%',
                                            transform: [{ translateY: panY }],
                                            backgroundColor: theme.background
                                        }
                                    ]}
                                >
                                    <View {...panResponder.panHandlers} style={styles.swipeHandleWrapper}>
                                        <View style={styles.swipeHandle} />
                                    </View>

                                    <View {...panResponder.panHandlers} style={[styles.header, { marginBottom: 20, justifyContent: 'center' }]}>
                                        <Text style={[styles.title, {color: theme.textPrimary}]}>Select Language</Text>
                                    </View>
                                    <ScrollView showsVerticalScrollIndicator={false}>
                                        {LANGUAGE_OPTIONS.map((opt) => (
                                            <HapticTouchableOpacity 
                                                key={opt.code}
                                                style={[
                                                    styles.menuItem, 
                                                    { 
                                                        marginBottom: 8, 
                                                        backgroundColor: (language === opt.code) || (!language && opt.code === 'GPS') 
                                                            ? (colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#F0F9FF') 
                                                            : theme.surface,
                                                        borderColor: theme.border,
                                                        borderWidth: 1
                                                    }
                                                ]}
                                                onPress={() => {
                                                    setLanguage(opt.code === 'GPS' ? undefined : opt.code);
                                                    closeLangModal();
                                                }}
                                                hapticType="selection"
                                            >
                                                <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                                                    <Text style={{fontSize: 24}}>{opt.flag}</Text>
                                                    <Text style={[styles.menuTitle, {fontSize: 18, color: theme.textPrimary}]}>{opt.label}</Text>
                                                </View>
                                                {((language === opt.code) || (!language && opt.code === 'GPS')) && (
                                                    <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6'}} />
                                                )}
                                            </HapticTouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </RNAnimated.View>
                             </TouchableOpacity>
                        </Modal>

                        {/* Submit */}
                        <HapticTouchableOpacity 
                            onPress={handleUpdate}
                            disabled={loading}
                            style={[styles.saveButton, {backgroundColor: theme.textPrimary, shadowColor: theme.shadow}]}
                            hapticType="success"
                        >
                            {loading ? <ActivityIndicator color={theme.background} /> : <Text style={[styles.saveText, {color: theme.background}]}>UPDATE PROFILE</Text>}
                        </HapticTouchableOpacity>

                     </ScrollView>
                 </RNAnimated.View>
             </View>
    </View>
  );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    sheetContainer: {
        // backgroundColor: '#F8FAFC', // Dynamic
        borderTopLeftRadius: 44,
        borderTopRightRadius: 44,
        height: '92%',
        padding: 32,
        paddingTop: 16,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: -4},
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
    },
    swipeHandleWrapper: {
        width: '100%',
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    swipeHandle: {
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#E2E8F0',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: '#0F172A',
        letterSpacing: -0.5,
    },
    closeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    section: {
        marginBottom: 40,
    },
    avatarWrapper: {
        alignItems: 'center',
        marginBottom: 32,
        position: 'relative',
    },
    avatarFrame: {
        width: 112,
        height: 112,
        borderRadius: 56,
        borderWidth: 4,
        borderColor: 'white',
        overflow: 'hidden',
        backgroundColor: 'white',
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowOffset: {width:0, height: 4},
        shadowRadius: 8,
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    cameraBtn: {
        position: 'absolute',
        bottom: 0,
        right: '34%', // Approximate center alignment offset
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#0F172A',
        borderWidth: 2,
        borderColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowOffset: {width:0, height: 2},
        shadowRadius: 4,
    },
    inputGroup: {
        marginBottom: 32,
        paddingHorizontal: 4,
    },
    label: {
        fontSize: 10,
        fontWeight: '900',
        color: '#94A3B8',
        letterSpacing: 2,
        marginBottom: 12,
        textTransform: 'uppercase',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    textInput: {
        width: '100%',
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#F1F5F9',
        borderRadius: 22,
        paddingHorizontal: 24,
        paddingVertical: 16,
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },
    presetGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    presetItem: {
        width: '22%',
        aspectRatio: 1,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'transparent',
        backgroundColor: 'white',
        padding: 4,
    },
    presetActive: {
        borderColor: '#3B82F6',
        backgroundColor: '#EFF6FF',
    },
    presetImage: {
        width: '100%',
        height: '100%',
        borderRadius: 12,
    },
    uploadBtn: {
        width: '22%',
        aspectRatio: 1,
        borderRadius: 16,
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: '#E2E8F0',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    uploadText: {
        fontSize: 8,
        fontWeight: '700',
        color: '#94A3B8',
    },
    menuContainer: {
        backgroundColor: 'white',
        borderRadius: 32,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        overflow: 'hidden', // Required for rounded corners on children
        marginBottom: 16,
        padding: 4,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderRadius: 28, // Matches inner radius
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },
    menuSub: {
        fontSize: 11,
        fontWeight: '500',
        color: '#94A3B8',
        marginTop: 2,
    },
    saveButton: {
        height: 72,
        backgroundColor: '#0F172A',
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 24,
        shadowColor: '#0F172A',
        shadowOpacity: 0.3,
        shadowOffset: {width: 0, height: 8},
        shadowRadius: 16,
        elevation: 8,
    },
    saveText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 2,
    },
});
