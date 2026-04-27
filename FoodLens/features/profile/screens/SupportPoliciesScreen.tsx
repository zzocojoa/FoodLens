import React from 'react';
import { Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import ProfileHeader from '../components/ProfileHeader';
import SupportPoliciesDesk, { type SupportPoliciesCopy } from '../components/SupportPoliciesDesk';
import { profileStyles as styles } from '../styles/profileStyles';

const PRIVACY_POLICY_URL = 'https://zzocojoa.github.io/FoodLens/docs/privacy-policy/';
const TERMS_OF_SERVICE_URL = 'https://zzocojoa.github.io/FoodLens/docs/terms-of-service/';

export default function SupportPoliciesScreen(): React.JSX.Element {
    const router = useRouter();
    const params = useLocalSearchParams<{ fromProfileSheet?: string }>();
    const { t } = useI18n();
    const { colorScheme } = useTheme();
    const theme = Colors[colorScheme];
    const insets = useSafeAreaInsets();

    const copy = React.useMemo<SupportPoliciesCopy>(
        () => ({
            supportTitle: t('profile.supportPolicies.support.title', 'Get help'),
            helpTitle: t('profileSheet.menu.help.title', 'Help Center'),
            helpDescription: t(
                'profile.supportPolicies.help.description',
                'Search common questions and scan guidance.',
            ),
            contactTitle: t('profileSheet.menu.contact.title', 'Contact Support'),
            contactDescription: t(
                'profile.supportPolicies.contact.description',
                'Send details to FoodLens support.',
            ),
            legalTitle: t('profile.section.legal', 'Legal'),
            privacyTitle: t('profileSheet.menu.privacy.title', 'Privacy Policy'),
            termsTitle: t('profileSheet.menu.terms.title', 'Terms of Service'),
            externalHint: t('profile.supportPolicies.legal.externalHint', 'Opens in your browser.'),
            accountTitle: t('profileSheet.menu.accountData.title', 'Account & Data'),
            accountDescription: t(
                'profile.supportPolicies.account.description',
                'Manage deletion requests and stored data.',
            ),
        }),
        [t],
    );

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
        void Linking.openURL(PRIVACY_POLICY_URL);
    }, []);

    const handleOpenTermsOfService = React.useCallback(() => {
        void Linking.openURL(TERMS_OF_SERVICE_URL);
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

            <SupportPoliciesDesk
                copy={copy}
                onOpenHelpCenter={handleOpenHelpCenter}
                onOpenSupportContact={handleOpenSupportContact}
                onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
                onOpenTermsOfService={handleOpenTermsOfService}
                onOpenAccountData={handleOpenAccountData}
                bottomInset={insets.bottom}
                colorScheme={colorScheme}
            />
        </SafeAreaView>
    );
}
