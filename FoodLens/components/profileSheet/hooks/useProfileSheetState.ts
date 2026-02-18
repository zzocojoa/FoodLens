import { useCallback, useState } from 'react';
import { DEFAULT_AVATARS } from '@/models/User';
import { DEFAULT_IMAGE, DEFAULT_NAME } from '../constants';
import { pickProfileImageUri } from '../utils/profileSheetStateUtils';
import { profileSheetService } from '../services/profileSheetService';
import { CanonicalLocale } from '@/features/i18n';
import { useI18n } from '@/features/i18n';
import { normalizeCanonicalLocale } from '@/features/i18n/services/languageService';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';

export const useProfileSheetState = (userId: string) => {
    const { t } = useI18n();
    const [name, setName] = useState(DEFAULT_NAME);
    const [image, setImage] = useState(DEFAULT_IMAGE);
    const [travelerLanguage, setTravelerLanguage] = useState<string | undefined>(undefined);
    const [uiLanguage, setUiLanguage] = useState<CanonicalLocale>('auto');
    const [travelerLangModalVisible, setTravelerLangModalVisible] = useState(false);
    const [uiLangModalVisible, setUiLangModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadProfile = useCallback(async () => {
        const profile = await profileSheetService.loadProfile(userId);
        if (profile) {
            setName(profile.name || DEFAULT_NAME);
            setImage(profile.profileImage || DEFAULT_IMAGE);
            setTravelerLanguage(profile.settings?.targetLanguage);
            setUiLanguage(normalizeCanonicalLocale(profile.settings?.language));
        }
    }, [userId]);

    const handleUpdate = useCallback(
        async (onUpdate: () => void | Promise<void>, onClose: () => void) => {
            setLoading(true);
            try {
                await profileSheetService.updateProfile({
                    userId,
                    name,
                    image,
                    travelerLanguage,
                    uiLanguage,
                });
                await Promise.resolve(onUpdate());
                onClose();
            } catch (error) {
                console.error("Profile update failed:", error);
                showTranslatedAlert(t, {
                    titleKey: 'profile.alert.errorTitle',
                    titleFallback: 'Error',
                    messageKey: 'profile.alert.saveFailed',
                    messageFallback: 'Failed to save.',
                });
            } finally {
                setLoading(false);
            }
        },
        [image, travelerLanguage, name, uiLanguage, userId, t]
    );

    const pickImage = useCallback(async (useCamera: boolean) => {
        try {
            const uri = await pickProfileImageUri(useCamera, {
                title: t('profile.permission.cameraRequiredTitle', 'Camera Permission Required'),
                message: t(
                    'profile.permission.cameraRequiredMessage',
                    'Camera access is required to take a profile photo.'
                ),
                cancelLabel: t('common.cancel', 'Cancel'),
                settingsLabel: t('scan.permission.openSettings', 'Open Settings'),
            });
            if (uri) setImage(uri);
        } catch {
            showTranslatedAlert(t, {
                titleKey: 'profile.alert.errorTitle',
                titleFallback: 'Error',
                messageKey: 'profile.alert.imagePickFailed',
                messageFallback: 'Failed to pick image.',
            });
        }
    }, [t]);

    return {
        name,
        setName,
        image,
        setImage,
        travelerLanguage,
        setTravelerLanguage,
        uiLanguage,
        setUiLanguage,
        travelerLangModalVisible,
        setTravelerLangModalVisible,
        uiLangModalVisible,
        setUiLangModalVisible,
        loading,
        loadProfile,
        handleUpdate,
        pickImage,
        avatars: DEFAULT_AVATARS,
    };
};
