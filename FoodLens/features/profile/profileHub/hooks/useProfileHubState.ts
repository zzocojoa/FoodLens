import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { DEFAULT_AVATARS } from '@/models/User';
import { CanonicalLocale, useI18n } from '@/features/i18n';
import { normalizeCanonicalLocale } from '@/features/i18n/services/languageService';
import { setUiLanguage as setUiLanguageInStore } from '@/features/i18n/services/i18nStore';
import { DEFAULT_NAME } from '../constants';
import { profileHubService } from '../services/profileHubService';
import { pickProfileImageUri } from '../utils/profileHubStateUtils';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { resolveImageUri } from '@/services/imageStorage';
import {
    getManualMergeConflictOperationsForUser,
    resolveManualMergeConflictsForUser,
} from '@/services/sync/phase2ConflictResolution';
import type { Phase2ConflictResolution } from '@/services/sync/phase2Sync.types';
import { SafeStorage } from '@/services/storage';
import { getUserStorageKey } from '@/services/user/constants';
import type { UserProfile } from '@/models/User';
import type { ProfileHubInitialState } from '../types';

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

const readInitialProfileSnapshot = (userId: string): UserProfile | null =>
    SafeStorage.getSync<UserProfile | null>(getUserStorageKey(userId), null);

const resolveProfileImageReference = (value: string | undefined): string | undefined => {
    if (!value) {
        return undefined;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
        return undefined;
    }

    return resolveImageUri(trimmedValue) ?? trimmedValue;
};

export const useProfileHubState = (
    userId: string,
    initialState?: ProfileHubInitialState,
) => {
    const { t } = useI18n();
    const initialStateRef = useRef<ProfileHubInitialState | undefined>(initialState);
    const initialProfileSnapshotRef = useRef<UserProfile | null>(readInitialProfileSnapshot(userId));
    const routeInitialState = initialStateRef.current;
    const initialProfile = initialProfileSnapshotRef.current;
    const initialName = routeInitialState?.name?.trim() || initialProfile?.name?.trim() || DEFAULT_NAME;
    const initialImage =
        resolveProfileImageReference(routeInitialState?.image) ??
        resolveProfileImageReference(initialProfile?.profileImage);
    const initialTravelerLanguage = initialProfile?.settings?.targetLanguage;
    const initialUiLanguage = initialProfile?.settings?.language
        ? normalizeCanonicalLocale(initialProfile.settings.language)
        : 'auto';
    const initialAssetId = initialProfile?.profileImageAssetId?.trim() || undefined;

    const [name, setNameState] = useState(initialName);
    const [image, setImageState] = useState<string | undefined>(initialImage);
    const [travelerLanguage, setTravelerLanguageState] = useState<string | undefined>(initialTravelerLanguage);
    const [uiLanguage, setUiLanguageState] = useState<CanonicalLocale>(initialUiLanguage);
    const [travelerLangModalVisible, setTravelerLangModalVisible] = useState(false);
    const [uiLangModalVisible, setUiLangModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const profileImageAssetIdRef = useRef<string | undefined>(initialAssetId);
    const loadProfileRequestIdRef = useRef(0);
    const profileHydrationRequestIdRef = useRef(0);
    const languageSaveRequestIdRef = useRef(0);
    const travelerLanguageSaveRequestIdRef = useRef(0);
    const travelerLanguageSaveInFlightRef = useRef<Promise<void> | null>(null);
    const pendingTravelerLanguageSaveRef = useRef<string | undefined>(initialTravelerLanguage);
    const pendingUiLanguageSaveRef = useRef<CanonicalLocale>(initialUiLanguage);
    const nameDirtyRef = useRef(false);
    const imageDirtyRef = useRef(false);
    const travelerLanguageDirtyRef = useRef(false);
    const uiLanguageDirtyRef = useRef(false);

    const applyProfileSnapshot = useCallback((profile: UserProfile) => {
        if (!nameDirtyRef.current) {
            setNameState(profile.name || DEFAULT_NAME);
        }

        const nextImage = resolveProfileImageReference(profile.profileImage);
        const nextAssetId = profile.profileImageAssetId?.trim() || undefined;
        setImageState((previous) => {
            if (imageDirtyRef.current) return previous;
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

        if (!travelerLanguageDirtyRef.current) {
            pendingTravelerLanguageSaveRef.current = profile.settings?.targetLanguage;
            setTravelerLanguageState(profile.settings?.targetLanguage);
        }

        const normalizedLanguage = normalizeCanonicalLocale(profile.settings?.language);
        const shouldApplyUiLanguage =
            !uiLanguageDirtyRef.current || pendingUiLanguageSaveRef.current === normalizedLanguage;
        if (shouldApplyUiLanguage) {
            uiLanguageDirtyRef.current = false;
            pendingUiLanguageSaveRef.current = normalizedLanguage;
            setUiLanguageState((previous) => {
                if (previous !== normalizedLanguage) {
                    void setUiLanguageInStore(normalizedLanguage);
                }

                return normalizedLanguage;
            });
        }
    }, []);

    const hydrateProfileFromCache = useCallback(async () => {
        const requestId = ++profileHydrationRequestIdRef.current;
        const profile = await SafeStorage.get<UserProfile | null>(getUserStorageKey(userId), null);
        if (!profile) return;
        if (requestId !== profileHydrationRequestIdRef.current) return;

        applyProfileSnapshot(profile);
    }, [applyProfileSnapshot, userId]);

    useEffect(() => {
        let cancelled = false;
        const loadLocalSnapshot = async () => {
            const requestId = ++profileHydrationRequestIdRef.current;
            const profile = await SafeStorage.get<UserProfile | null>(getUserStorageKey(userId), null);
            if (cancelled || !profile) return;
            if (requestId !== profileHydrationRequestIdRef.current) return;

            applyProfileSnapshot(profile);
        };

        void loadLocalSnapshot();
        return () => {
            cancelled = true;
            profileHydrationRequestIdRef.current += 1;
        };
    }, [applyProfileSnapshot, userId]);

    const isSyncNotConfirmedError = useCallback(
        (error: unknown): boolean => error instanceof Error && error.message === 'PHASE2_SYNC_NOT_CONFIRMED',
        [],
    );

    const promptConflictResolution = useCallback(
        (count: number): Promise<Phase2ConflictResolution | null> =>
            new Promise((resolve) => {
                let settled = false;
                const conflictMessage = t('sync.conflict.message').replace('{count}', String(count));
                const settle = (value: Phase2ConflictResolution | null) => {
                    if (settled) return;
                    settled = true;
                    resolve(value);
                };

                Alert.alert(
                    t('sync.conflict.title'),
                    conflictMessage,
                    [
                        {
                            text: t('sync.conflict.action.later'),
                            style: 'cancel',
                            onPress: () => settle(null),
                        },
                        {
                            text: t('sync.conflict.action.keepServer'),
                            onPress: () => settle('use_server'),
                        },
                        {
                            text: t('sync.conflict.action.keepDevice'),
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
        imageDirtyRef.current = true;
        profileImageAssetIdRef.current = undefined;
        setImageState(value);
    }, []);

    const setName = useCallback((value: string) => {
        nameDirtyRef.current = true;
        setNameState(value);
    }, []);

    const flushTravelerLanguageSave = useCallback((): Promise<void> => {
        if (travelerLanguageSaveInFlightRef.current) {
            return travelerLanguageSaveInFlightRef.current;
        }

        let processedRequestId = travelerLanguageSaveRequestIdRef.current;
        const runner = (async () => {
            while (true) {
                processedRequestId = travelerLanguageSaveRequestIdRef.current;
                const travelerLanguageToSave = pendingTravelerLanguageSaveRef.current;

                try {
                    await profileHubService.updateTravelerLanguage({
                        userId,
                        travelerLanguage: travelerLanguageToSave,
                        shouldAbort: () => processedRequestId !== travelerLanguageSaveRequestIdRef.current,
                    });
                } catch (error) {
                    if (processedRequestId !== travelerLanguageSaveRequestIdRef.current) {
                        continue;
                    }

                    console.warn('[ProfileHub] traveler language auto-save failed', error);
                    return;
                }

                if (processedRequestId !== travelerLanguageSaveRequestIdRef.current) {
                    continue;
                }

                travelerLanguageDirtyRef.current = false;
                return;
            }
        })().finally(() => {
            travelerLanguageSaveInFlightRef.current = null;
            if (processedRequestId !== travelerLanguageSaveRequestIdRef.current) {
                void flushTravelerLanguageSave();
            }
        });

        travelerLanguageSaveInFlightRef.current = runner;
        return runner;
    }, [userId]);

    const setTravelerLanguage = useCallback((value: string | undefined) => {
        travelerLanguageDirtyRef.current = true;
        pendingTravelerLanguageSaveRef.current = value;
        setTravelerLanguageState(value);
        travelerLanguageSaveRequestIdRef.current += 1;
        void flushTravelerLanguageSave();
    }, [flushTravelerLanguageSave]);

    const handlePendingConflicts = useCallback(async (): Promise<void> => {
        const conflicts = await getManualMergeConflictOperationsForUser(userId);
        if (conflicts.length === 0) {
            return;
        }

        const resolution = await promptConflictResolution(conflicts.length);
        if (!resolution) {
            showTranslatedAlert(t, {
                titleKey: 'sync.conflict.deferredTitle',
                messageKey: 'sync.conflict.deferredMessage',
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
                messageKey: 'sync.conflict.resolvedMessage',
            });
            return;
        }

        showTranslatedAlert(t, {
            titleKey: 'sync.conflict.remainingTitle',
            messageKey: 'sync.conflict.remainingMessage',
        });
    }, [promptConflictResolution, t, userId]);

    const loadProfile = useCallback(async () => {
        const requestId = ++loadProfileRequestIdRef.current;
        const profile = await profileHubService.loadProfile(userId);
        if (requestId !== loadProfileRequestIdRef.current) {
            return;
        }
        if (profile) {
            applyProfileSnapshot(profile);
        }
    }, [applyProfileSnapshot, userId]);

    const setUiLanguage = useCallback((value: CanonicalLocale) => {
        const normalized = normalizeCanonicalLocale(value);
        uiLanguageDirtyRef.current = true;
        pendingUiLanguageSaveRef.current = normalized;
        setUiLanguageState(normalized);
        void setUiLanguageInStore(normalized);
        const requestId = ++languageSaveRequestIdRef.current;
        void profileHubService
            .updateSettingsLanguage({
                userId,
                uiLanguage: normalized,
            })
            .then(() => {
                if (requestId !== languageSaveRequestIdRef.current) {
                    return;
                }

                uiLanguageDirtyRef.current = false;
                pendingUiLanguageSaveRef.current = normalized;
            })
            .catch((error) => {
                if (requestId !== languageSaveRequestIdRef.current) {
                    return;
                }
                uiLanguageDirtyRef.current = false;
                pendingUiLanguageSaveRef.current = normalized;
                console.warn('[ProfileHub] settings language auto-save failed', error);
            });
    }, [userId]);

    const invalidateProfileLoad = useCallback(() => {
        loadProfileRequestIdRef.current += 1;
    }, []);

    const resetLocalEdits = useCallback(() => {
        nameDirtyRef.current = false;
        imageDirtyRef.current = false;
        travelerLanguageDirtyRef.current = false;
    }, []);

    const handleUpdate = useCallback(
        async (onUpdate: () => void | Promise<void>, onClose: () => void) => {
            setLoading(true);
            try {
                let updateError: unknown = null;
                try {
                    await profileHubService.updateProfile({
                        userId,
                        name,
                        image: image || '',
                        imageChanged: imageDirtyRef.current,
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
                resetLocalEdits();
                await Promise.resolve(onUpdate());
                onClose();
            } catch (error) {
                console.error("Profile update failed:", error);
                showTranslatedAlert(t, {
                    titleKey: 'profile.alert.errorTitle',
                    messageKey: 'profile.alert.saveFailed',
                });
            } finally {
                setLoading(false);
            }
        },
        [handlePendingConflicts, image, travelerLanguage, name, uiLanguage, userId, t, isSyncNotConfirmedError, resetLocalEdits]
    );

    const pickImage = useCallback(async (useCamera: boolean) => {
        try {
            const uri = await pickProfileImageUri(useCamera, {
                title: useCamera
                    ? t('profile.permission.cameraRequiredTitle', 'Camera Permission Required')
                    : t('profile.permission.libraryRequiredTitle', 'Photo Library Permission Required'),
                message: useCamera
                    ? t(
                        'profile.permission.cameraRequiredMessage',
                        'Camera access is required to take a profile photo.'
                    )
                    : t(
                        'profile.permission.libraryRequiredMessage',
                        'Photo library access is required to choose a profile photo.'
                    ),
                cancelLabel: t('common.cancel', 'Cancel'),
                settingsLabel: t('scan.permission.openSettings', 'Open Settings'),
            });
            if (uri) setImage(uri);
        } catch {
            showTranslatedAlert(t, {
                titleKey: 'profile.alert.errorTitle',
                messageKey: 'profile.alert.imagePickFailed',
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
        hydrateProfileFromCache,
        invalidateProfileLoad,
        resetLocalEdits,
        handleUpdate,
        pickImage,
        avatars: DEFAULT_AVATARS,
    };
};
