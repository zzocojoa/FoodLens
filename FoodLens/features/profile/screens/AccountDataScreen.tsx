import React from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import {
    AuthApiError,
    type AuthDeletionRequest,
    type AuthDeletionRequestStatus,
    type AuthDeletionRequestTarget,
} from '@/services/auth/authApi';
import {
    clearLocalDeletionFootprint,
    consumeDeletionRequestFinalization,
    createDeletionRequest,
    getLatestDeletionRequest,
} from '@/services/auth/deletionService';
import ProfileHeader from '../components/ProfileHeader';
import { profileStyles as styles } from '../styles/profileStyles';

const DELETION_STATUS_POLL_INTERVAL_MS = 4000;

const isActiveDeletionStatus = (status: AuthDeletionRequestStatus): boolean =>
    status === 'pending' || status === 'in_progress';

const getDeletionStatusCopy = (
    status: AuthDeletionRequestStatus,
    t: (key: string, fallback?: string) => string,
): { label: string; title: string } => {
    if (status === 'pending') {
        return {
            label: t('profile.deletion.status.pending', 'Requested'),
            title: t('profile.deletion.status.pendingTitle', 'Your request has been received'),
        };
    }

    if (status === 'in_progress') {
        return {
            label: t('profile.deletion.status.inProgress', 'In Progress'),
            title: t('profile.deletion.status.inProgressTitle', 'We are processing your request'),
        };
    }

    if (status === 'done') {
        return {
            label: t('profile.deletion.status.done', 'Completed'),
            title: t('profile.deletion.status.doneTitle', 'Your deletion request is complete'),
        };
    }

    return {
        label: t('profile.deletion.status.failed', 'Failed'),
        title: t('profile.deletion.status.failedTitle', 'Your deletion request needs attention'),
    };
};

const getDeletionTargetCopy = (
    target: AuthDeletionRequestTarget,
    t: (key: string, fallback?: string) => string,
): string =>
    target === 'account'
        ? t('profile.deletion.target.account', 'Account Deletion')
        : t('profile.deletion.target.data', 'Data Deletion');

const getDeletionStatusColors = (
    status: AuthDeletionRequestStatus,
    colorScheme: 'light' | 'dark',
): { backgroundColor: string; borderColor: string; textColor: string } => {
    if (status === 'done') {
        return colorScheme === 'dark'
            ? {
                  backgroundColor: 'rgba(34, 197, 94, 0.12)',
                  borderColor: 'rgba(34, 197, 94, 0.4)',
                  textColor: '#86EFAC',
              }
            : {
                  backgroundColor: '#F0FDF4',
                  borderColor: '#86EFAC',
                  textColor: '#166534',
              };
    }

    if (status === 'failed') {
        return colorScheme === 'dark'
            ? {
                  backgroundColor: 'rgba(248, 113, 113, 0.12)',
                  borderColor: 'rgba(248, 113, 113, 0.4)',
                  textColor: '#FCA5A5',
              }
            : {
                  backgroundColor: '#FEF2F2',
                  borderColor: '#FCA5A5',
                  textColor: '#B91C1C',
              };
    }

    return colorScheme === 'dark'
        ? {
              backgroundColor: 'rgba(96, 165, 250, 0.12)',
              borderColor: 'rgba(96, 165, 250, 0.4)',
              textColor: '#93C5FD',
          }
        : {
              backgroundColor: '#EFF6FF',
              borderColor: '#93C5FD',
              textColor: '#1D4ED8',
          };
};

const formatDeletionTimestamp = (
    value: string,
    locale: string,
): string => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return parsed.toLocaleString(locale);
};

export default function AccountDataScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ fromProfileSheet?: string }>();
    const { locale, t } = useI18n();
    const { colorScheme } = useTheme();
    const theme = Colors[colorScheme];
    const insets = useSafeAreaInsets();
    const [deletionRequest, setDeletionRequest] = React.useState<AuthDeletionRequest | null>(null);
    const [deletionStatusError, setDeletionStatusError] = React.useState<string | null>(null);
    const [deletionLoadingTarget, setDeletionLoadingTarget] = React.useState<AuthDeletionRequestTarget | null>(null);
    const [deletionStatusLoading, setDeletionStatusLoading] = React.useState(false);

    const handleBack = React.useCallback(() => {
        if (params.fromProfileSheet === '1') {
            router.replace({
                pathname: '/(tabs)',
                params: { openProfile: '1' },
            });
            return;
        }
        router.back();
    }, [params.fromProfileSheet, router]);

    const loadLatestDeletionRequest = React.useCallback(
        async (options: { silent: boolean }) => {
            if (!options.silent) {
                setDeletionStatusLoading(true);
            }

            try {
                const latestDeletionRequest = await getLatestDeletionRequest();
                setDeletionRequest(latestDeletionRequest);
                setDeletionStatusError(null);
            } catch (error) {
                if (
                    error instanceof AuthApiError &&
                    (
                        error.code === 'AUTH_SESSION_REQUIRED' ||
                        error.code === 'AUTH_TOKEN_EXPIRED' ||
                        error.code === 'AUTH_TOKEN_INVALID'
                    )
                ) {
                    setDeletionRequest(null);
                    setDeletionStatusError(null);
                    return;
                }
                const message =
                    error instanceof Error
                        ? error.message
                        : t('profile.deletion.error.generic', 'We could not load your deletion request status.');
                setDeletionStatusError(message);
            } finally {
                if (!options.silent) {
                    setDeletionStatusLoading(false);
                }
            }
        },
        [t],
    );

    const finalizeDeletedRequest = React.useCallback(
        (request: AuthDeletionRequest) => {
            Alert.alert(
                request.target === 'account'
                    ? t('profile.deletion.accountDeleted.title', 'Account deleted')
                    : t('profile.deletion.dataDeleted.title', 'Data deleted'),
                request.target === 'account'
                    ? t(
                          'profile.deletion.accountDeleted.message',
                          'Your account deletion request is complete. This device will now be cleared and signed out.',
                      )
                    : t(
                          'profile.deletion.dataDeleted.message',
                          'Your data deletion request is complete. This device will now be cleared to prevent deleted data from being restored.',
                      ),
                [
                    {
                        text: t('common.continue', 'Continue'),
                        onPress: () => {
                            void clearLocalDeletionFootprint().finally(() => {
                                router.replace('/login');
                            });
                        },
                    },
                ],
                { cancelable: false },
            );
        },
        [router, t],
    );

    React.useEffect(() => {
        void loadLatestDeletionRequest({ silent: true });
    }, [loadLatestDeletionRequest]);

    React.useEffect(() => {
        if (!deletionRequest || !isActiveDeletionStatus(deletionRequest.status)) {
            return undefined;
        }

        const intervalId = setInterval(() => {
            void loadLatestDeletionRequest({ silent: true });
        }, DELETION_STATUS_POLL_INTERVAL_MS);

        return () => {
            clearInterval(intervalId);
        };
    }, [deletionRequest, loadLatestDeletionRequest]);

    React.useEffect(() => {
        if (!deletionRequest) {
            return;
        }

        if (consumeDeletionRequestFinalization(deletionRequest)) {
            finalizeDeletedRequest(deletionRequest);
        }
    }, [deletionRequest, finalizeDeletedRequest]);

    const submitDeletionRequest = React.useCallback(
        async (target: AuthDeletionRequestTarget) => {
            setDeletionLoadingTarget(target);
            setDeletionStatusError(null);

            try {
                const nextDeletionRequest = await createDeletionRequest(target);
                setDeletionRequest(nextDeletionRequest);
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : t('profile.deletion.error.generic', 'We could not submit your deletion request.');
                setDeletionStatusError(message);
                Alert.alert(
                    t('profile.deletion.error.title', 'Request failed'),
                    message,
                );
            } finally {
                setDeletionLoadingTarget(null);
            }
        },
        [t],
    );

    const confirmDeletionRequest = React.useCallback(
        (target: AuthDeletionRequestTarget) => {
            const isAccountDeletion = target === 'account';
            Alert.alert(
                isAccountDeletion
                    ? t('profile.deletion.account.confirmTitle', 'Delete your account?')
                    : t('profile.deletion.data.confirmTitle', 'Delete your data?'),
                isAccountDeletion
                    ? t(
                          'profile.deletion.account.confirmMessage',
                          'This will request deletion of your FoodLens account and stored data. When complete, this device will be cleared and signed out.',
                      )
                    : t(
                          'profile.deletion.data.confirmMessage',
                          'This will request deletion of your stored FoodLens data. When complete, this device will be cleared and signed out to prevent deleted data from being restored.',
                      ),
                [
                    {
                        text: t('common.cancel', 'Cancel'),
                        style: 'cancel',
                    },
                    {
                        text: isAccountDeletion
                            ? t('profile.deletion.account.confirmAction', 'Delete Account')
                            : t('profile.deletion.data.confirmAction', 'Delete Data'),
                        style: 'destructive',
                        onPress: () => {
                            void submitDeletionRequest(target);
                        },
                    },
                ],
                { cancelable: true },
            );
        },
        [submitDeletionRequest, t],
    );

    const deletionStatusCopy = deletionRequest
        ? getDeletionStatusCopy(deletionRequest.status, t)
        : null;
    const deletionStatusColors = deletionRequest
        ? getDeletionStatusColors(deletionRequest.status, colorScheme)
        : null;

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
            <ProfileHeader
                theme={theme}
                onBack={handleBack}
                title={t('profile.section.accountAndData', 'Account & Data')}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                enabled={Platform.OS === 'ios'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={{
                        paddingBottom: insets.bottom + 32,
                    }}
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="on-drag"
                >
                    <View style={styles.heroSection}>
                        <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>
                            {t('profile.section.accountAndData', 'Account & Data')}
                        </Text>
                        <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                            {t(
                                'profile.deletion.description',
                                'Submit a deletion request for your account or your stored FoodLens data. You will see the latest request status here.',
                            )}
                        </Text>
                    </View>

                    {deletionRequest && deletionStatusCopy && deletionStatusColors ? (
                        <View
                            style={{
                                backgroundColor: deletionStatusColors.backgroundColor,
                                borderColor: deletionStatusColors.borderColor,
                                borderWidth: 1,
                                borderRadius: 18,
                                padding: 16,
                                marginBottom: 16,
                                gap: 8,
                            }}
                        >
                            <View
                                style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '700', flex: 1 }}>
                                    {getDeletionTargetCopy(deletionRequest.target, t)}
                                </Text>
                                <View
                                    style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                        backgroundColor: theme.background,
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: deletionStatusColors.textColor,
                                            fontSize: 12,
                                            fontWeight: '800',
                                        }}
                                    >
                                        {deletionStatusCopy.label}
                                    </Text>
                                </View>
                            </View>
                            <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '600' }}>
                                {deletionStatusCopy.title}
                            </Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
                                {t('profile.deletion.updatedAt', 'Last updated')}:{' '}
                                {formatDeletionTimestamp(deletionRequest.completedAt ?? deletionRequest.requestedAt, locale)}
                            </Text>
                            {deletionRequest.message ? (
                                <Text style={{ color: deletionStatusColors.textColor, fontSize: 13, lineHeight: 18 }}>
                                    {deletionRequest.message}
                                </Text>
                            ) : null}
                            {deletionRequest.status === 'failed' && deletionRequest.requestId ? (
                                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                                    {t('profile.deletion.requestId', 'Request ID')}: {deletionRequest.requestId}
                                </Text>
                            ) : null}
                        </View>
                    ) : null}

                    {deletionStatusError ? (
                        <Text
                            style={{
                                color: colorScheme === 'dark' ? '#FCA5A5' : '#DC2626',
                                fontSize: 13,
                                lineHeight: 18,
                                marginBottom: 12,
                            }}
                        >
                            {deletionStatusError}
                        </Text>
                    ) : null}

                    {deletionStatusLoading ? (
                        <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <ActivityIndicator color={theme.textPrimary} size="small" />
                            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                                {t('profile.deletion.loading', 'Loading latest request status...')}
                            </Text>
                        </View>
                    ) : null}

                    <TouchableOpacity
                        style={[
                            styles.logoutButton,
                            {
                                marginTop: 0,
                                marginBottom: 10,
                                borderColor: theme.border,
                                backgroundColor: 'transparent',
                                flexDirection: 'row',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: 8,
                                opacity: deletionLoadingTarget ? 0.6 : 1,
                            },
                        ]}
                        onPress={() => confirmDeletionRequest('data')}
                        disabled={deletionLoadingTarget !== null}
                        accessibilityRole="button"
                        accessibilityLabel={t('profile.deletion.data.button', 'Delete My Data')}
                        accessibilityState={{ disabled: deletionLoadingTarget !== null }}
                    >
                        {deletionLoadingTarget === 'data' ? (
                            <ActivityIndicator color={theme.textPrimary} size="small" />
                        ) : null}
                        <Text style={[styles.logoutButtonText, { color: theme.textPrimary }]}>
                            {t('profile.deletion.data.button', 'Delete My Data')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.logoutButton,
                            {
                                marginTop: 0,
                                borderColor: colorScheme === 'dark' ? 'rgba(248, 113, 113, 0.38)' : '#FECACA',
                                backgroundColor: 'transparent',
                                flexDirection: 'row',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: 8,
                                opacity: deletionLoadingTarget ? 0.6 : 1,
                            },
                        ]}
                        onPress={() => confirmDeletionRequest('account')}
                        disabled={deletionLoadingTarget !== null}
                        accessibilityRole="button"
                        accessibilityLabel={t('profile.deletion.account.button', 'Delete Account')}
                        accessibilityState={{ disabled: deletionLoadingTarget !== null }}
                    >
                        {deletionLoadingTarget === 'account' ? (
                            <ActivityIndicator color={colorScheme === 'dark' ? '#FCA5A5' : '#B91C1C'} size="small" />
                        ) : null}
                        <Text
                            style={[
                                styles.logoutButtonText,
                                { color: colorScheme === 'dark' ? '#FCA5A5' : '#B91C1C' },
                            ]}
                        >
                            {t('profile.deletion.account.button', 'Delete Account')}
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
