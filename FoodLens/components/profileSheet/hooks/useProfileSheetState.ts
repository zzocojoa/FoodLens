import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { DEFAULT_AVATARS } from '@/models/User';
import { DEFAULT_NAME } from '../constants';
import { pickProfileImageUri } from '../utils/profileSheetStateUtils';
import { profileSheetService } from '../services/profileSheetService';
import { CanonicalLocale, useI18n } from '@/features/i18n';
import { normalizeCanonicalLocale } from '@/features/i18n/services/languageService_Logic';
import { showTranslatedAlert } from '@/services/ui/uiAlerts_Logic';
import {
    getManualMergeConflictOperationsForUser,
    resolveManualMergeConflictsForUser,
} from '@/services/sync/phase2ConflictResolution_Logic';
import type { Phase2ConflictResolution } from '@/services/sync/phase2Sync.types_Structure';
import { SafeStorage } from '@/services/storage_Logic';
import { getUserStorageKey } from '@/services/user/constants_Logic';
import type { UserProfile } from '@/models/User';

const PROFILE_IMAGE_REUSE_BUFFER_MS = 15_000;

const extractSignedExpiryMs = (uri: string): number | null => {
    const match = uri.match(/[?&]exp=(\d{10,13})/);
    if (!match) return null;
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) return null;
    return raw > 1_000_000_000_000 ? raw : raw * 1000;
};

const shouldKeepExistingProfileImage = (
    previousImage: string | undefined,
    previousAssetId: string | undefined,
    nextImage: string | undefined,
    nextAssetId: string | undefined,
): boolean => {
    if (!previousImage || !nextImage) return false;
    if (!previousAssetId || !nextAssetId) return false;
    if (previousAssetId !== nextAssetId) return false;
    if (previousImage === nextImage) return true;

    const expiryMs = extractSignedExpiryMs(previousImage);
    if (expiryMs === null) {
        return true;
    }
    return expiryMs - Date.now() > PROFILE_IMAGE_REUSE_BUFFER_MS;
};

export const useProfileSheetState = (userId: string) => {
    const { t } = useI18n();
    const [name, setName] = useState(DEFAULT_NAME);
    const [image, setImageState] = useState<string | undefined>(undefined);
    const [travelerLanguage, setTravelerLanguage] = useState<string | undefined>(undefined);
    const [uiLanguage, setUiLanguage] = useState<CanonicalLocale>('auto');
    const [travelerLangModalVisible, setTravelerLangModalVisible] = useState(false);
    const [uiLangModalVisible, setUiLangModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const profileImageAssetIdRef = useRef<string | undefined>(undefined);
    const loadProfileRequestIdRef = useRef(0);

    useEffect(() => {
        let cancelled = false;
        const loadLocalSnapshot = async () => {
            const profile = await SafeStorage.get<UserProfile | null>(getUserStorageKey(userId), null);
            if (cancelled || !profile) return;

            const localImage = profile.profileImage?.trim() || undefined;
            if (localImage) {
                setImageState((previous) => previous || localImage);
                profileImageAssetIdRef.current = profile.profileImageAssetId?.trim() || undefined;
            }
            const localName = profile.name?.trim();
            if (localName) {
                setName((previous) => (previous === DEFAULT_NAME ? localName : previous));
            }
            if (profile.settings?.targetLanguage) {
                setTravelerLanguage((previous) => previous ?? profile.settings.targetLanguage);
            }
            if (profile.settings?.language) {
                setUiLanguage((previous) =>
                    previous === 'auto'
                        ? normalizeCanonicalLocale(profile.settings?.language)
                        : previous
                );
            }
        };

        void loadLocalSnapshot();
        return () => {
            cancelled = true;
        };
    }, [userId]);

    const isSyncNotConfirmedError = useCallback(
        (error: unknown): boolean => error instanceof Error && error.message === 'PHASE2_SYNC_NOT_CONFIRMED',
        [],
    );

    const promptConflictResolution = useCallback(
        (count: number): Promise<Phase2ConflictResolution | null> =>
            new Promise((resolve) => {
                let settled = false;
                const settle = (value: Phase2ConflictResolution | null) => {
                    if (settled) return;
                    settled = true;
                    resolve(value);
                };

                Alert.alert(
                    t('sync.conflict.title', 'Sync conflict detected'),
                    t(
                        'sync.conflict.message',
                        `Saved locally, but ${count} cloud conflict(s) were found. Choose which data to keep.`,
                    ),
                    [
                        {
                            text: t('sync.conflict.action.later', 'Later'),
                            style: 'cancel',
                            onPress: () => settle(null),
                        },
                        {
                            text: t('sync.conflict.action.keepServer', 'Keep Server'),
                            onPress: () => settle('use_server'),
                        },
                        {
                            text: t('sync.conflict.action.keepDevice', 'Keep This Device'),
                            style: 'destructive',
                            onPress: () => settle('use_local'),
                        },
                    ],
                    {
                        cancelable: true,
                        onDismiss: () => settle(null),
                    },
                );
            }),
        [t],
    );

    const setImage = useCallback((value: string) => {
        profileImageAssetIdRef.current = undefined;
        setImageState(value);
    }, []);

    const handlePendingConflicts = useCallback(async (): Promise<void> => {
        const conflicts = await getManualMergeConflictOperationsForUser(userId);
        if (conflicts.length === 0) {
            return;
        }

        const resolution = await promptConflictResolution(conflicts.length);
        if (!resolution) {
            showTranslatedAlert(t, {
                titleKey: 'sync.conflict.deferredTitle',
                titleFallback: 'Saved locally',
                messageKey: 'sync.conflict.deferredMessage',
                messageFallback:
                    'Cloud sync has pending conflicts. Resolve them later from this device.',
            });
            return;
        }

        const result = await resolveManualMergeConflictsForUser({
            userId,
            resolution,
        });

        if (result.remaining === 0) {
            showTranslatedAlert(t, {
                titleKey: 'sync.conflict.resolvedTitle',
                titleFallback: 'Conflict resolved',
                messageKey: 'sync.conflict.resolvedMessage',
                messageFallback:
                    resolution === 'use_server'
                        ? 'Server version was kept for conflicting fields.'
                        : 'This device version was re-applied to the server.',
            });
            return;
        }

        showTranslatedAlert(t, {
            titleKey: 'sync.conflict.remainingTitle',
            titleFallback: 'Conflicts remaining',
            messageKey: 'sync.conflict.remainingMessage',
            messageFallback: 'Some conflicts are still pending. Please try again.',
        });
    }, [promptConflictResolution, t, userId]);

    const loadProfile = useCallback(async () => {
        const requestId = ++loadProfileRequestIdRef.current;
        const profile = await profileSheetService.loadProfile(userId);
        if (requestId !== loadProfileRequestIdRef.current) {
            return;
        }
        if (profile) {
            setName(profile.name || DEFAULT_NAME);
            const nextImage = profile.profileImage?.trim() || undefined;
            const nextAssetId = profile.profileImageAssetId?.trim() || undefined;
            setImageState((previous) => {
                if (!nextImage) return previous;
                if (shouldKeepExistingProfileImage(
                    previous,
                    profileImageAssetIdRef.current,
                    nextImage,
                    nextAssetId,
                )) {
                    return previous;
                }
                return nextImage;
            });
            profileImageAssetIdRef.current = nextAssetId;
            setTravelerLanguage(profile.settings?.targetLanguage);
            setUiLanguage(normalizeCanonicalLocale(profile.settings?.language));
        }
    }, [userId]);

    const invalidateProfileLoad = useCallback(() => {
        loadProfileRequestIdRef.current += 1;
    }, []);

    const handleUpdate = useCallback(
        async (onUpdate: () => void | Promise<void>, onClose: () => void) => {
            setLoading(true);
            try {
                let updateError: unknown = null;
                try {
                    await profileSheetService.updateProfile({
                        userId,
                        name,
                        image: image || '',
                        travelerLanguage,
                        uiLanguage,
                    });
                } catch (error) {
                    updateError = error;
                }

                if (updateError && !isSyncNotConfirmedError(updateError)) {
                    throw updateError;
                }

                await handlePendingConflicts();
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
        [handlePendingConflicts, image, travelerLanguage, name, uiLanguage, userId, t, isSyncNotConfirmedError]
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
    }, [setImage, t]);

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
        invalidateProfileLoad,
        handleUpdate,
        pickImage,
        avatars: DEFAULT_AVATARS,
    };
};
