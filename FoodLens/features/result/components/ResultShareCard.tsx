import React from 'react';
import {
    Image,
    StyleSheet,
    Text,
    View,
    type ImageSourcePropType,
} from 'react-native';

export type ResultShareCardThemeVariant = 'safe' | 'caution' | 'avoid';

type ResultShareCardProps = {
    brandLabel: string;
    foodName: string;
    safetyLabel: string;
    reasonTitle: string;
    actionTitle: string;
    reasons: string[];
    actionLine: string;
    disclaimer: string;
    imageSource: ImageSourcePropType | null;
    locationLabel: string | null;
    placeholderLabel: string;
    themeVariant: ResultShareCardThemeVariant;
};

type CardTheme = {
    backgroundStart: string;
    backgroundEnd: string;
    badgeBackground: string;
    badgeText: string;
    accent: string;
};

const CARD_THEME_MAP: Record<ResultShareCardThemeVariant, CardTheme> = {
    safe: {
        backgroundStart: '#ECFDF5',
        backgroundEnd: '#F8FAFC',
        badgeBackground: '#D1FAE5',
        badgeText: '#047857',
        accent: '#10B981',
    },
    caution: {
        backgroundStart: '#FFF7ED',
        backgroundEnd: '#F8FAFC',
        badgeBackground: '#FED7AA',
        badgeText: '#C2410C',
        accent: '#F97316',
    },
    avoid: {
        backgroundStart: '#FEF2F2',
        backgroundEnd: '#F8FAFC',
        badgeBackground: '#FECACA',
        badgeText: '#B91C1C',
        accent: '#EF4444',
    },
};

const getCardTheme = (themeVariant: ResultShareCardThemeVariant): CardTheme =>
    CARD_THEME_MAP[themeVariant];

export default function ResultShareCard({
    brandLabel,
    foodName,
    safetyLabel,
    reasonTitle,
    actionTitle,
    reasons,
    actionLine,
    disclaimer,
    imageSource,
    locationLabel,
    placeholderLabel,
    themeVariant,
}: ResultShareCardProps) {
    const theme = getCardTheme(themeVariant);

    return (
        <View
            style={[
                styles.card,
                {
                    borderColor: theme.badgeBackground,
                    backgroundColor: theme.backgroundEnd,
                },
            ]}
        >
            <View
                style={[
                    styles.heroBackdrop,
                    {
                        backgroundColor: theme.backgroundStart,
                    },
                ]}
            />

            <View style={styles.headerRow}>
                <Text style={styles.brandLabel}>{brandLabel}</Text>
                <View
                    style={[
                        styles.safetyBadge,
                        {
                            backgroundColor: theme.badgeBackground,
                        },
                    ]}
                >
                    <Text style={[styles.safetyBadgeText, { color: theme.badgeText }]}>
                        {safetyLabel}
                    </Text>
                </View>
            </View>

            <View
                style={[
                    styles.heroCard,
                    {
                        borderColor: `${theme.accent}26`,
                    },
                ]}
            >
                {imageSource ? (
                    <Image source={imageSource} style={styles.heroImage} resizeMode="cover" />
                ) : (
                    <View
                        style={[
                            styles.imagePlaceholder,
                            {
                                backgroundColor: `${theme.accent}14`,
                            },
                        ]}
                    >
                        <Text style={[styles.imagePlaceholderText, { color: theme.badgeText }]}>
                            {placeholderLabel}
                        </Text>
                    </View>
                )}
            </View>

            <Text style={styles.foodName}>{foodName}</Text>

            {locationLabel ? (
                <Text style={styles.locationLabel}>{locationLabel}</Text>
            ) : null}

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{reasonTitle}</Text>
                <View style={styles.reasonList}>
                    {reasons.map((reason) => (
                        <View key={reason} style={styles.reasonRow}>
                            <View
                                style={[
                                    styles.reasonDot,
                                    {
                                        backgroundColor: theme.accent,
                                    },
                                ]}
                            />
                            <Text style={styles.reasonText}>{reason}</Text>
                        </View>
                    ))}
                </View>
            </View>

            <View
                style={[
                    styles.actionPanel,
                    {
                        borderColor: `${theme.accent}33`,
                        backgroundColor: `${theme.accent}10`,
                    },
                ]}
            >
                <Text style={styles.actionTitle}>{actionTitle}</Text>
                <Text style={styles.actionText}>{actionLine}</Text>
            </View>

            <Text style={styles.disclaimer}>{disclaimer}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        width: '100%',
        borderRadius: 28,
        borderWidth: 1,
        overflow: 'hidden',
        padding: 18,
    },
    heroBackdrop: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.9,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    brandLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    safetyBadge: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    safetyBadgeText: {
        fontSize: 12,
        fontWeight: '800',
    },
    heroCard: {
        borderRadius: 22,
        borderWidth: 1,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        marginBottom: 16,
    },
    heroImage: {
        width: '100%',
        height: 184,
        backgroundColor: '#E2E8F0',
    },
    imagePlaceholder: {
        width: '100%',
        height: 184,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    imagePlaceholderText: {
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
    },
    foodName: {
        fontSize: 28,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 6,
    },
    locationLabel: {
        fontSize: 14,
        color: '#64748B',
        marginBottom: 18,
    },
    section: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#334155',
        textTransform: 'uppercase',
        marginBottom: 10,
        letterSpacing: 0.4,
    },
    reasonList: {
        gap: 10,
    },
    reasonRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    reasonDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginTop: 7,
    },
    reasonText: {
        flex: 1,
        fontSize: 15,
        lineHeight: 22,
        color: '#1E293B',
        fontWeight: '600',
    },
    actionPanel: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 14,
        marginBottom: 16,
    },
    actionTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#334155',
        textTransform: 'uppercase',
        marginBottom: 6,
        letterSpacing: 0.4,
    },
    actionText: {
        fontSize: 15,
        lineHeight: 22,
        color: '#0F172A',
        fontWeight: '700',
    },
    disclaimer: {
        fontSize: 12,
        lineHeight: 18,
        color: '#64748B',
        fontWeight: '600',
    },
});
