import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput, 
  Modal, ScrollView, Alert, Platform, ActivityIndicator 
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { X, Camera, Image as ImageIcon, User, Zap, ChevronRight, Edit3 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { UserService } from '../services/userService';

interface ProfileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onUpdate: () => void;
}

export default function ProfileSheet({ isOpen, onClose, userId, onUpdate }: ProfileSheetProps) {
  const router = useRouter();
  const [name, setName] = useState("Traveler Joy");
  const [image, setImage] = useState("https://api.dicebear.com/7.x/avataaars/png?seed=Felix");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
     if (isOpen) {
         loadProfile();
     }
  }, [isOpen]);

  const loadProfile = async () => {
      const profile = await UserService.getUserProfile(userId);
      if (profile) {
          setName(profile.name || "Traveler Joy");
          setImage(profile.profileImage || "https://api.dicebear.com/7.x/avataaars/png?seed=Felix");
      }
  };

  const defaultAvatars = [
    "https://api.dicebear.com/7.x/avataaars/png?seed=Felix",
    "https://api.dicebear.com/7.x/avataaars/png?seed=Aneka",
    "https://api.dicebear.com/7.x/avataaars/png?seed=Marley",
    "https://api.dicebear.com/7.x/avataaars/png?seed=Aiden",
    "https://api.dicebear.com/7.x/avataaars/png?seed=Luna",
    "https://api.dicebear.com/7.x/avataaars/png?seed=Caleb"
  ];

  const handleUpdate = async () => {
      setLoading(true);
      try {
          await UserService.updateUserProfile(userId, {
              name: name,
              profileImage: image
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

          if (!result.canceled) {
              setImage(result.assets[0].uri);
          }
      } catch (e) {
          Alert.alert("Error", "Failed to pick image");
      }
  };

  return (
    <Modal
        visible={isOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
    >
        <BlurView intensity={20} style={styles.overlay}>
             <View style={styles.sheetContainer}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Profile</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <X size={20} color="#94A3B8" />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 40}}>
                    {/* Part 1: Visual Identity */}
                    <View style={styles.section}>
                        <View style={styles.avatarWrapper}>
                           <View style={styles.avatarFrame}>
                               <Image source={{ uri: image }} style={styles.avatarImage} />
                           </View>
                           <TouchableOpacity 
                                onPress={() => pickImage(true)}
                                style={styles.cameraBtn}
                           >
                               <Camera size={16} color="white" />
                           </TouchableOpacity>
                        </View>

                        {/* Name Edit */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>DISPLAY NAME</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    value={name}
                                    onChangeText={setName}
                                    style={styles.textInput}
                                    placeholder="Enter your name"
                                    placeholderTextColor="#94A3B8"
                                />
                                <Edit3 size={16} color="#CBD5E1" style={{position: 'absolute', right: 20}} />
                            </View>
                        </View>

                        {/* Presets */}
                        <View>
                            <Text style={[styles.label, {marginBottom: 12}]}>PRESETS</Text>
                            <View style={styles.presetGrid}>
                                {defaultAvatars.map((url, idx) => (
                                    <TouchableOpacity 
                                        key={idx}
                                        onPress={() => setImage(url)}
                                        style={[
                                            styles.presetItem, 
                                            image === url && styles.presetActive
                                        ]}
                                    >
                                        <Image source={{ uri: url }} style={styles.presetImage} />
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity 
                                    onPress={() => pickImage(false)}
                                    style={styles.uploadBtn}
                                >
                                    <ImageIcon size={18} color="#94A3B8" />
                                    <Text style={styles.uploadText}>Upload</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Part 2: Management */}
                    <View style={styles.section}>
                        <View style={styles.menuContainer}>
                            <TouchableOpacity 
                                style={styles.menuItem}
                                onPress={() => {
                                    onClose();
                                    router.push('/profile');
                                }}
                            >
                                <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
                                    <View style={[styles.iconBox, {backgroundColor: '#EFF6FF'}]}>
                                        <User size={20} color="#2563EB" />
                                    </View>
                                    <View>
                                        <Text style={styles.menuTitle}>Manage Profile</Text>
                                        <Text style={styles.menuSub}>Account settings & details</Text>
                                    </View>
                                </View>
                                <ChevronRight size={18} color="#CBD5E1" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.menuContainer}>
                            <TouchableOpacity style={styles.menuItem}>
                                <View style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
                                    <View style={[styles.iconBox, {backgroundColor: '#FFFBEB'}]}>
                                        <Zap size={20} color="#D97706" fill="#D97706" />
                                    </View>
                                    <View>
                                        <Text style={styles.menuTitle}>Remove Ads</Text>
                                        <Text style={styles.menuSub}>Premium benefits</Text>
                                    </View>
                                </View>
                                <ChevronRight size={18} color="#CBD5E1" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Submit */}
                    <TouchableOpacity 
                        onPress={handleUpdate}
                        disabled={loading}
                        style={styles.saveButton}
                    >
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>UPDATE PROFILE</Text>}
                    </TouchableOpacity>

                </ScrollView>
             </View>
        </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    sheetContainer: {
        backgroundColor: '#F8FAFC',
        borderTopLeftRadius: 44,
        borderTopRightRadius: 44,
        height: '92%',
        padding: 32,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: -4},
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
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
        width: '100%',
        height: 72,
        backgroundColor: '#0F172A',
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
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
