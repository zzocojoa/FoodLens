import React from 'react';
import {
    Animated as RNAnimated,
    type GestureResponderHandlers,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import { Check } from 'lucide-react-native';

import { HapticPressable } from '@/components/HapticFeedback';
import type { ColorSchemeName } from '@/constants/theme';
import HomePearlSurfaceOverlay from '@/features/home/components/PearlSurfaceOverlay';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardSpacing,
    homeDashboardTypography,
} from '@/features/home/components/homeDashboardTokens';

import type { LanguageOption } from '../types';

type LanguageSelectorModalProps = {
    visible: boolean;
    title: string;
    options: LanguageOption[];
    selectedCode?: string;
    colorScheme?: ColorSchemeName;
    theme?: {
        background: string;
        border: string;
        surface: string;
        textPrimary: string;
        textSecondary?: string;
    };
    panY: RNAnimated.Value;
    panHandlers: GestureResponderHandlers;
    onClose: () => void;
    onSelectLanguage: (code: string) => void;
    normalizeForSelection?: (code?: string | null) => string | null;
};

type LanguageSelectorModalTone = {
    overlay: string;
    sheetBackground: string;
    sheetBorder: string;
    handle: string;
    title: string;
    optionBackground: string;
    optionBorder: string;
    optionLabel: string;
    optionFlagBackground: string;
    optionFlagBorder: string;
    indicatorBorder: string;
    selectedBackground: string;
    selectedBorder: string;
    selectedLabel: string;
    selectedFlagBackground: string;
    selectedFlagBorder: string;
    selectedIndicatorBackground: string;
    selectedIndicatorIcon: string;
};

export default function LanguageSelectorModal(props: LanguageSelectorModalProps): React.JSX.Element | null {
    const {
        visible,
        title,
        options,
        selectedCode,
        colorScheme,
        theme,
        panY,
        panHandlers,
        onClose,
        onSelectLanguage,
        normalizeForSelection,
    } = props;
    const systemColorScheme = useColorScheme();

    const normalize =
        normalizeForSelection ||
        ((code?: string | null) => (typeof code === 'string' && code.trim().length > 0 ? code.trim() : null));
    const normalizedSelected = normalize(selectedCode);

    const isSelected = (optionCode: string): boolean => {
        return normalize(optionCode) === normalizedSelected;
    };
    const resolvedColorScheme: ColorSchemeName =
        colorScheme ?? (systemColorScheme === 'dark' ? 'dark' : 'light');
    const tone = React.useMemo<LanguageSelectorModalTone>(() => {
        if (resolvedColorScheme === 'dark') {
            return {
                overlay: 'rgba(2, 6, 23, 0.58)',
                sheetBackground: theme?.background ?? 'rgba(7, 12, 21, 0.96)',
                sheetBorder: theme?.border ?? 'rgba(255, 255, 255, 0.10)',
                handle: 'rgba(148, 163, 184, 0.42)',
                title: theme?.textPrimary ?? homeDashboardColors.pearlIvory,
                optionBackground: 'rgba(16, 23, 37, 0.88)',
                optionBorder: 'rgba(148, 163, 184, 0.18)',
                optionLabel: theme?.textPrimary ?? homeDashboardColors.pearlIvory,
                optionFlagBackground: 'rgba(255, 255, 255, 0.06)',
                optionFlagBorder: 'rgba(255, 255, 255, 0.08)',
                indicatorBorder: 'rgba(255, 255, 255, 0.14)',
                selectedBackground: homeDashboardColors.accentBlue,
                selectedBorder: 'rgba(255, 255, 255, 0.08)',
                selectedLabel: homeDashboardColors.pearlIvory,
                selectedFlagBackground: 'rgba(255, 255, 255, 0.12)',
                selectedFlagBorder: 'rgba(255, 255, 255, 0.12)',
                selectedIndicatorBackground: homeDashboardColors.pearlIvory,
                selectedIndicatorIcon: homeDashboardColors.accentBlue,
            };
        }

        return {
            overlay: 'rgba(23, 32, 51, 0.22)',
            sheetBackground: theme?.background ?? homeDashboardColors.paperMuted,
            sheetBorder: theme?.border ?? homeDashboardColors.line,
            handle: homeDashboardColors.lineStrong,
            title: theme?.textPrimary ?? homeDashboardColors.ink,
            optionBackground: 'rgba(255, 252, 247, 0.92)',
            optionBorder: homeDashboardColors.line,
            optionLabel: theme?.textPrimary ?? homeDashboardColors.ink,
            optionFlagBackground: 'rgba(36, 56, 93, 0.08)',
            optionFlagBorder: 'rgba(36, 56, 93, 0.08)',
            indicatorBorder: 'rgba(23, 32, 51, 0.12)',
            selectedBackground: homeDashboardColors.accentBlue,
            selectedBorder: homeDashboardColors.accentBlue,
            selectedLabel: homeDashboardColors.pearlIvory,
            selectedFlagBackground: 'rgba(255, 255, 255, 0.12)',
            selectedFlagBorder: 'rgba(255, 255, 255, 0.12)',
            selectedIndicatorBackground: homeDashboardColors.pearlIvory,
            selectedIndicatorIcon: homeDashboardColors.accentBlue,
        };
    }, [resolvedColorScheme, theme]);

    if (!visible) {
        return null;
    }

    return (
        <Modal animationType="none" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
            <View style={[styles.overlay, { backgroundColor: tone.overlay }]}>
                <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.dismissArea} />

                <RNAnimated.View
                    style={[
                        styles.sheetContainer,
                        {
                            backgroundColor: tone.sheetBackground,
                            borderColor: tone.sheetBorder,
                            transform: [{ translateY: panY }],
                        },
                    ]}
                >
                    {resolvedColorScheme === 'dark' ? null : (
                        <HomePearlSurfaceOverlay
                            accentWashColor={homeDashboardColors.pearlMist}
                            baseBottomColor={homeDashboardColors.paperStrong}
                            baseTopColor={homeDashboardColors.pearlIvory}
                            coolWashColor={homeDashboardColors.pearlGlow}
                            warmWashColor={homeDashboardColors.pearlPeach}
                        />
                    )}

                    <View style={styles.content}>
                        <View {...panHandlers} style={styles.handleWrap}>
                            <View style={[styles.handle, { backgroundColor: tone.handle }]} />
                        </View>

                        <View {...panHandlers} style={styles.header}>
                            <Text style={[styles.title, { color: tone.title }]}>{title}</Text>
                        </View>

                        <ScrollView
                            keyboardDismissMode="on-drag"
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.optionList}>
                                {options.map((option) => {
                                    const optionSelected = isSelected(option.code);

                                    return (
                                        <HapticPressable
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: optionSelected }}
                                            hapticType="selection"
                                            key={option.code}
                                            onPress={() => onSelectLanguage(option.code)}
                                            style={[
                                                styles.optionCard,
                                                {
                                                    backgroundColor: optionSelected
                                                        ? tone.selectedBackground
                                                        : tone.optionBackground,
                                                    borderColor: optionSelected
                                                        ? tone.selectedBorder
                                                        : tone.optionBorder,
                                                },
                                            ]}
                                        >
                                            <View style={styles.optionCopy}>
                                                <View
                                                    style={[
                                                        styles.optionFlagWrap,
                                                        {
                                                            backgroundColor: optionSelected
                                                                ? tone.selectedFlagBackground
                                                                : tone.optionFlagBackground,
                                                            borderColor: optionSelected
                                                                ? tone.selectedFlagBorder
                                                                : tone.optionFlagBorder,
                                                        },
                                                    ]}
                                                >
                                                    <Text style={styles.optionFlag}>{option.flag}</Text>
                                                </View>
                                                <Text
                                                    style={[
                                                        styles.optionLabel,
                                                        {
                                                            color: optionSelected
                                                                ? tone.selectedLabel
                                                                : tone.optionLabel,
                                                        },
                                                    ]}
                                                >
                                                    {option.label}
                                                </Text>
                                            </View>

                                            <View
                                                style={[
                                                    styles.selectionIndicator,
                                                    optionSelected
                                                        ? {
                                                              backgroundColor: tone.selectedIndicatorBackground,
                                                              borderColor: tone.selectedIndicatorBackground,
                                                          }
                                                        : { borderColor: tone.indicatorBorder },
                                                ]}
                                            >
                                                {optionSelected ? (
                                                    <Check
                                                        color={tone.selectedIndicatorIcon}
                                                        size={14}
                                                        strokeWidth={2.8}
                                                    />
                                                ) : null}
                                            </View>
                                        </HapticPressable>
                                    );
                                })}
                            </View>
                        </ScrollView>
                    </View>
                </RNAnimated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    dismissArea: {
        flex: 1,
    },
    sheetContainer: {
        borderTopLeftRadius: homeDashboardRadii.xl,
        borderTopRightRadius: homeDashboardRadii.xl,
        borderWidth: 1,
        maxHeight: '68%',
        minHeight: '40%',
        overflow: 'hidden',
        paddingHorizontal: homeDashboardSpacing.md,
        paddingTop: homeDashboardSpacing.xs,
        position: 'relative',
    },
    content: {
        gap: homeDashboardSpacing.sm,
        paddingBottom: homeDashboardSpacing.lg,
        zIndex: 1,
    },
    handleWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 24,
    },
    handle: {
        borderRadius: homeDashboardRadii.pill,
        height: 4,
        width: 40,
    },
    header: {
        justifyContent: 'center',
        paddingBottom: 2,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.5,
        lineHeight: 24,
    },
    optionList: {
        gap: homeDashboardSpacing.xs,
        paddingBottom: homeDashboardSpacing.sm,
    },
    optionCard: {
        alignItems: 'center',
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.md,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 56,
        paddingHorizontal: 14,
        paddingVertical: 11,
    },
    optionCopy: {
        alignItems: 'center',
        flexDirection: 'row',
        flex: 1,
        gap: homeDashboardSpacing.sm,
    },
    optionFlagWrap: {
        alignItems: 'center',
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        height: 34,
        justifyContent: 'center',
        width: 34,
    },
    optionFlag: {
        fontSize: 18,
    },
    optionLabel: {
        flexShrink: 1,
        fontSize: homeDashboardTypography.bodyStrong,
        fontWeight: '800',
        lineHeight: 18,
    },
    selectionIndicator: {
        alignItems: 'center',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        height: 24,
        justifyContent: 'center',
        width: 24,
    },
});
