import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Database, FileText, LifeBuoy, Mail } from 'lucide-react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import ProfileMenuItem from '@/components/profileSheet/components/ProfileMenuItem';
import ProfileHeader from '../components/ProfileHeader';
import { profileStyles as styles } from '../styles/profileStyles';

export default function SupportPoliciesScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ fromProfileSheet?: string }>();
    const { t } = useI18n();
    const { colorScheme } = useTheme();
    const theme = Colors[colorScheme];
    const insets = useSafeAreaInsets();

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

    const handleOpenHelpCenter = React.useCallback(() => {
        router.push('/help/faq');
    }, [router]);

    const handleOpenSupportContact = React.useCallback(() => {
        router.push('/help/contact');
    }, [router]);

    const handleOpenPrivacyPolicy = React.useCallback(() => {
        void Linking.openURL('https://zzocojoa.github.io/FoodLens/docs/privacy-policy/');
    }, []);

    const handleOpenTermsOfService = React.useCallback(() => {
        void Linking.openURL('https://zzocojoa.github.io/FoodLens/docs/terms-of-service/');
    }, []);

    const handleOpenAccountData = React.useCallback(() => {
        router.push('/account-data');
    }, [router]);

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
            <ProfileHeader
                theme={theme}
                onBack={handleBack}
                title={t('profile.supportHub.title', 'Support & Policies')}
            />

            <ScrollView
                style={styles.container}
                contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="on-drag"
            >
                <View style={styles.heroSection}>
                    <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>
                        {t('profile.supportHub.title', 'Support & Policies')}
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
                        {t(
                            'profile.supportHub.subtitle',
                            'Find help, review legal documents, and manage account data in one place.',
                        )}
                    </Text>
                </View>

                <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                    {t('profile.support.title', 'Help & Support')}
                </Text>
                <ProfileMenuItem
                    icon={<LifeBuoy size={20} color="#7C3AED" />}
                    title={t('profileSheet.menu.help.title', 'Help Center')}
                    subtitle={t('profileSheet.menu.help.subtitle', 'Browse answers and support guidance')}
                    iconBgColor={colorScheme === 'dark' ? 'rgba(124, 58, 237, 0.2)' : '#F5F3FF'}
                    onPress={handleOpenHelpCenter}
                    theme={theme}
                />
                <ProfileMenuItem
                    icon={<Mail size={20} color="#059669" />}
                    title={t('profileSheet.menu.contact.title', 'Contact Support')}
                    subtitle={t('profileSheet.menu.contact.subtitle', 'Send a support email from the app')}
                    iconBgColor={colorScheme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5'}
                    onPress={handleOpenSupportContact}
                    theme={theme}
                />

                <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                    {t('profile.section.legal', 'Legal')}
                </Text>
                <ProfileMenuItem
                    icon={<FileText size={20} color="#2563EB" />}
                    title={t('profileSheet.menu.privacy.title', 'Privacy Policy')}
                    subtitle={t('profileSheet.menu.privacy.subtitle', 'Review how FoodLens handles your data')}
                    iconBgColor={colorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
                    onPress={handleOpenPrivacyPolicy}
                    theme={theme}
                />
                <ProfileMenuItem
                    icon={<FileText size={20} color="#D97706" />}
                    title={t('profileSheet.menu.terms.title', 'Terms of Service')}
                    subtitle={t('profileSheet.menu.terms.subtitle', 'Read the service terms and conditions')}
                    iconBgColor={colorScheme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#FFFBEB'}
                    onPress={handleOpenTermsOfService}
                    theme={theme}
                />

                <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>
                    {t('profile.section.accountAndData', 'Account & Data')}
                </Text>
                <ProfileMenuItem
                    icon={<Database size={20} color="#DC2626" />}
                    title={t('profileSheet.menu.accountData.title', 'Account & Data')}
                    subtitle={t('profileSheet.menu.accountData.subtitle', 'Deletion requests and account cleanup')}
                    iconBgColor={colorScheme === 'dark' ? 'rgba(220, 38, 38, 0.2)' : '#FEF2F2'}
                    onPress={handleOpenAccountData}
                    theme={theme}
                />
            </ScrollView>
        </SafeAreaView>
    );
}
