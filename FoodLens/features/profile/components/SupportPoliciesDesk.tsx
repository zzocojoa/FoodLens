import React from 'react';
import {
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';
import type {
    StyleProp,
    TextStyle,
    ViewStyle,
} from 'react-native';
import { ChevronRight, ExternalLink, LifeBuoy, Mail } from 'lucide-react-native';

import { Colors, type ColorSchemeName } from '@/constants/theme';
import { HomeBackgroundAtmosphere } from '../../home/components/HomeBackgroundAtmosphere';
import { PearlSurfaceOverlay } from '../../home/components/PearlSurfaceOverlay';
import {
    homeDashboardColors,
    homeDashboardSpacing,
} from '../../home/components/homeDashboardTokens';
import { supportPoliciesStyles as styles } from '../styles/supportPoliciesStyles';

export type SupportPoliciesCopy = {
    supportTitle: string;
    helpTitle: string;
    helpDescription: string;
    contactTitle: string;
    contactDescription: string;
    legalTitle: string;
    privacyTitle: string;
    termsTitle: string;
    externalHint: string;
    accountTitle: string;
    accountDescription: string;
};

export type SupportPoliciesDeskProps = {
    copy: SupportPoliciesCopy;
    onOpenHelpCenter: () => void;
    onOpenSupportContact: () => void;
    onOpenPrivacyPolicy: () => void;
    onOpenTermsOfService: () => void;
    onOpenAccountData: () => void;
    bottomInset: number;
    colorScheme: ColorSchemeName;
};

type SupportActionRowProps = {
    chevronColor: string;
    description: string;
    descriptionStyle: StyleProp<TextStyle>;
    icon: React.ReactNode;
    iconWrapStyle: StyleProp<ViewStyle>;
    onPress: () => void;
    rowStyle: StyleProp<ViewStyle>;
    title: string;
    titleStyle: StyleProp<TextStyle>;
};

type CompactPolicyRowProps = {
    iconColor: string;
    hint: string;
    labelStyle: StyleProp<TextStyle>;
    onPress: () => void;
    pressedBackgroundColor: string;
    restBackgroundColor: string;
    rowBorderStyle: StyleProp<ViewStyle>;
    title: string;
};

type AccountDataRowProps = {
    chevronColor: string;
    description: string;
    descriptionStyle: StyleProp<TextStyle>;
    onPress: () => void;
    rowStyle: StyleProp<ViewStyle>;
    title: string;
    titleStyle: StyleProp<TextStyle>;
};

function SupportActionRow({
    chevronColor,
    description,
    descriptionStyle,
    icon,
    iconWrapStyle,
    onPress,
    rowStyle,
    title,
    titleStyle,
}: SupportActionRowProps): React.JSX.Element {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                rowStyle,
                {
                    opacity: pressed ? 0.84 : 1,
                },
            ]}
        >
            <View style={iconWrapStyle}>{icon}</View>
            <View style={styles.rowCopy}>
                <Text style={titleStyle}>{title}</Text>
                <Text style={descriptionStyle}>{description}</Text>
            </View>
            <ChevronRight color={chevronColor} size={20} style={styles.rowIcon} />
        </Pressable>
    );
}

function CompactPolicyRow({
    iconColor,
    hint,
    labelStyle,
    onPress,
    pressedBackgroundColor,
    restBackgroundColor,
    rowBorderStyle,
    title,
}: CompactPolicyRowProps): React.JSX.Element {
    return (
        <Pressable
            accessibilityHint={hint}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.compactRow,
                rowBorderStyle,
                {
                    backgroundColor: pressed ? pressedBackgroundColor : restBackgroundColor,
                },
            ]}
        >
            <Text style={labelStyle}>{title}</Text>
            <ExternalLink color={iconColor} size={18} style={styles.rowIcon} />
        </Pressable>
    );
}

function AccountDataRow({
    chevronColor,
    description,
    descriptionStyle,
    onPress,
    rowStyle,
    title,
    titleStyle,
}: AccountDataRowProps): React.JSX.Element {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                rowStyle,
                {
                    opacity: pressed ? 0.84 : 1,
                },
            ]}
        >
            <View style={styles.rowCopy}>
                <Text style={titleStyle}>{title}</Text>
                <Text style={descriptionStyle}>{description}</Text>
            </View>
            <ChevronRight color={chevronColor} size={20} style={styles.rowIcon} />
        </Pressable>
    );
}

export default function SupportPoliciesDesk({
    bottomInset,
    colorScheme,
    copy,
    onOpenAccountData,
    onOpenHelpCenter,
    onOpenPrivacyPolicy,
    onOpenSupportContact,
    onOpenTermsOfService,
}: SupportPoliciesDeskProps): React.JSX.Element {
    const isDarkMode = colorScheme === 'dark';
    const mutedTextStyle = isDarkMode ? styles.darkTextSecondary : null;
    const primaryTextStyle = isDarkMode ? styles.darkTextPrimary : null;
    const panelStyle = isDarkMode ? styles.darkPanel : null;
    const mutedPanelStyle = isDarkMode ? styles.darkMutedPanel : null;
    const rowIconColor = isDarkMode ? Colors.dark.textSecondary : homeDashboardColors.inkSoft;
    const policyRestBackgroundColor = isDarkMode ? Colors.dark.surface : homeDashboardColors.surfaceStrong;
    const policyPressedBackgroundColor = isDarkMode
        ? Colors.dark.background
        : homeDashboardColors.surfaceMuted;

    return (
        <View style={[styles.root, isDarkMode ? styles.darkRoot : null]}>
            {isDarkMode ? null : <HomeBackgroundAtmosphere />}
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: bottomInset + homeDashboardSpacing.xxxl },
                ]}
                contentInsetAdjustmentBehavior="automatic"
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="always"
                style={styles.scroll}
            >
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, mutedTextStyle]}>{copy.supportTitle}</Text>
                    <View style={[styles.supportSurface, panelStyle]}>
                        {isDarkMode ? null : (
                            <PearlSurfaceOverlay
                                accentWashColor={homeDashboardColors.accentGreenSoft}
                                baseBottomColor={homeDashboardColors.paperMuted}
                                baseTopColor={homeDashboardColors.pearlIvory}
                                coolWashColor={homeDashboardColors.pearlMist}
                                warmWashColor={homeDashboardColors.pearlPeach}
                            />
                        )}
                        <View style={styles.surfaceContent}>
                            <SupportActionRow
                                chevronColor={homeDashboardColors.paper}
                                description={copy.helpDescription}
                                descriptionStyle={styles.primaryDescription}
                                icon={<LifeBuoy color={homeDashboardColors.ink} size={19} strokeWidth={2.5} />}
                                iconWrapStyle={styles.primaryIconWrap}
                                onPress={onOpenHelpCenter}
                                rowStyle={styles.primaryAction}
                                title={copy.helpTitle}
                                titleStyle={styles.primaryTitle}
                            />
                            <SupportActionRow
                                chevronColor={homeDashboardColors.inkSoft}
                                description={copy.contactDescription}
                                descriptionStyle={[styles.secondaryDescription, mutedTextStyle]}
                                icon={<Mail color={homeDashboardColors.accentGreen} size={18} strokeWidth={2.5} />}
                                iconWrapStyle={styles.secondaryIconWrap}
                                onPress={onOpenSupportContact}
                                rowStyle={[styles.secondaryAction, mutedPanelStyle]}
                                title={copy.contactTitle}
                                titleStyle={[styles.secondaryTitle, primaryTextStyle]}
                            />
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, mutedTextStyle]}>{copy.legalTitle}</Text>
                    <View style={[styles.compactGroup, panelStyle]}>
                        <CompactPolicyRow
                            iconColor={rowIconColor}
                            hint={copy.externalHint}
                            labelStyle={[styles.compactLabel, primaryTextStyle]}
                            onPress={onOpenPrivacyPolicy}
                            pressedBackgroundColor={policyPressedBackgroundColor}
                            restBackgroundColor={policyRestBackgroundColor}
                            rowBorderStyle={styles.compactRowBorder}
                            title={copy.privacyTitle}
                        />
                        <CompactPolicyRow
                            iconColor={rowIconColor}
                            hint={copy.externalHint}
                            labelStyle={[styles.compactLabel, primaryTextStyle]}
                            onPress={onOpenTermsOfService}
                            pressedBackgroundColor={policyPressedBackgroundColor}
                            restBackgroundColor={policyRestBackgroundColor}
                            rowBorderStyle={null}
                            title={copy.termsTitle}
                        />
                    </View>
                </View>

                <AccountDataRow
                    chevronColor={rowIconColor}
                    description={copy.accountDescription}
                    descriptionStyle={[styles.secondaryDescription, mutedTextStyle]}
                    onPress={onOpenAccountData}
                    rowStyle={[styles.neutralRow, mutedPanelStyle]}
                    title={copy.accountTitle}
                    titleStyle={[styles.secondaryTitle, primaryTextStyle]}
                />
            </ScrollView>
        </View>
    );
}
