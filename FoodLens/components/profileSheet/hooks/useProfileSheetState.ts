import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { DEFAULT_AVATARS } from '@/models/User';
import { UserService } from '@/services/userService';
import { saveImagePermanently } from '@/services/imageStorage';
import { DEFAULT_IMAGE, DEFAULT_NAME } from '../constants';

export const useProfileSheetState = (userId: string) => {
    const [name, setName] = useState(DEFAULT_NAME);
    const [image, setImage] = useState(DEFAULT_IMAGE);
    const [language, setLanguage] = useState<string | undefined>(undefined);
    const [langModalVisible, setLangModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadProfile = useCallback(async () => {
        const profile = await UserService.getUserProfile(userId);
        if (profile) {
            setName(profile.name || DEFAULT_NAME);
            setImage(profile.profileImage || DEFAULT_IMAGE);
            setLanguage(profile.settings?.targetLanguage);
        }
    }, [userId]);

    const handleUpdate = useCallback(
        async (onUpdate: () => void, onClose: () => void) => {
            setLoading(true);
            try {
                let profileImageToSave = image;

                // If image is a local temp file (starts with file://) and NOT already in our permanent dir
                if (image.startsWith('file://')) {
                    const filename = await saveImagePermanently(image);
                    if (filename) {
                        profileImageToSave = filename;
                    } else {
                        // If save failed, do NOT save the temp URI to the profile.
                        // It will expire and show broken image.
                        throw new Error("이미지 저장에 실패했습니다.");
                    }
                }

                await UserService.CreateOrUpdateProfile(userId, 'user@example.com', {
                    name,
                    profileImage: profileImageToSave,
                    settings: {
                        targetLanguage: language,
                        language: 'en',
                        autoPlayAudio: false,
                    },
                });
                onUpdate();
                onClose();
            } catch (error) {
                console.error("Profile update failed:", error);
                Alert.alert('오류', '프로필 업데이트에 실패했습니다.');
            } finally {
                setLoading(false);
            }
        },
        [image, language, name, userId]
    );

    const pickImage = useCallback(async (useCamera: boolean) => {
        try {
            let result;
            if (useCamera) {
                const perm = await ImagePicker.requestCameraPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert('Permission Needed', 'Camera access is required.');
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

                if (useCamera) {
                    try {
                        await MediaLibrary.saveToLibraryAsync(uri);
                    } catch (error) {
                        console.error('Failed to save profile photo to gallery:', error);
                    }
                }
            }
        } catch {
            Alert.alert('Error', 'Failed to pick image');
        }
    }, []);

    return {
        name,
        setName,
        image,
        setImage,
        language,
        setLanguage,
        langModalVisible,
        setLangModalVisible,
        loading,
        loadProfile,
        handleUpdate,
        pickImage,
        avatars: DEFAULT_AVATARS,
    };
};
