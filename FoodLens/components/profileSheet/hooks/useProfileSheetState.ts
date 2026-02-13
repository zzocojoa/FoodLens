import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { DEFAULT_AVATARS } from '@/models/User';
import { DEFAULT_IMAGE, DEFAULT_NAME } from '../constants';
import { pickProfileImageUri } from '../utils/profileSheetStateUtils';
import { profileSheetService } from '../services/profileSheetService';

export const useProfileSheetState = (userId: string) => {
    const [name, setName] = useState(DEFAULT_NAME);
    const [image, setImage] = useState(DEFAULT_IMAGE);
    const [language, setLanguage] = useState<string | undefined>(undefined);
    const [langModalVisible, setLangModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadProfile = useCallback(async () => {
        const profile = await profileSheetService.loadProfile(userId);
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
                await profileSheetService.updateProfile({
                    userId,
                    name,
                    image,
                    language,
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
            const uri = await pickProfileImageUri(useCamera);
            if (uri) setImage(uri);
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
