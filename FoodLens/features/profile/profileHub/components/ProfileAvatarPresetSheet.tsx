import React from 'react';
import {
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import type { ColorSchemeName } from '@/constants/theme';
import ProfilePearlSurfaceOverlay from '@/features/home/components/PearlSurfaceOverlay';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardSpacing,
} from '@/features/home/components/homeDashboardTokens';
import { useI18n } from '@/features/i18n';

type ProfileAvatarPresetSheetProps = {
    visible: boolean;
    colorScheme: ColorSchemeName;
    avatars: string[];
    selectedImage?: string;
    onClose: () => void;
    onSelectPreset: (url: string) => void;
};

export default function ProfileAvatarPresetSheet({
    visible,
    colorScheme,
    avatars,
    selectedImage,
    onClose,
    onSelectPreset,
}: ProfileAvatarPresetSheetProps): React.JSX.Element | null {
    const { t } = useI18n();
    const isDarkTheme = colorScheme === 'dark';

    if (!visible) {
        return null;
    }

    return (
        <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
            <View style={styles.overlay}>
                <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.dismissArea} />

                <SafeAreaView edges={['bottom']} style={styles.sheetSafeArea}>
                    <View style={[styles.sheetContainer, isDarkTheme ? styles.sheetContainerDark : null]}>
                        {isDarkTheme ? null : (
                            <ProfilePearlSurfaceOverlay
                                accentWashColor={homeDashboardColors.pearlMist}
                                baseBottomColor={homeDashboardColors.paperStrong}
                                baseTopColor={homeDashboardColors.pearlIvory}
                                coolWashColor={homeDashboardColors.pearlGlow}
                                warmWashColor={homeDashboardColors.pearlPeach}
                            />
                        )}

                        <View style={styles.sheetContent}>
                            <View style={styles.handle} />

                            <View style={styles.headerRow}>
                                <Text style={[styles.title, isDarkTheme ? styles.titleDark : null]}>
                                    {t('profileAtelier.hero.action.presets', 'Presets')}
                                </Text>
                                <HapticTouchableOpacity
                                    accessibilityLabel={t('common.cancel', 'Cancel')}
                                    accessibilityRole="button"
                                    activeOpacity={0.9}
                                    hapticType="light"
                                    onPress={onClose}
                                    style={[styles.closeButton, isDarkTheme ? styles.closeButtonDark : null]}
                                >
                                    <X
                                        color={
                                            isDarkTheme ? 'rgba(255, 255, 255, 0.72)' : homeDashboardColors.inkSoft
                                        }
                                        size={16}
                                    />
                                </HapticTouchableOpacity>
                            </View>

                            <ScrollView
                                contentContainerStyle={styles.grid}
                                keyboardDismissMode="on-drag"
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {avatars.map((url, index) => {
                                    const isSelected = selectedImage === url;

                                    return (
                                        <HapticTouchableOpacity
                                            accessibilityRole="button"
                                            activeOpacity={0.9}
                                            hapticType="selection"
                                            key={`${url}-${index}`}
                                            onPress={() => onSelectPreset(url)}
                                            style={[
                                                styles.avatarCard,
                                                isDarkTheme ? styles.avatarCardDark : null,
                                                isSelected ? styles.avatarCardSelected : null,
                                            ]}
                                        >
                                            <Image source={{ uri: url }} style={styles.avatarImage} />
                                            {isSelected ? (
                                                <View style={styles.selectedBadge}>
                                                    <Check color={homeDashboardColors.pearlIvory} size={14} />
                                                </View>
                                            ) : null}
                                        </HapticTouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        backgroundColor: 'rgba(23, 32, 51, 0.2)',
        flex: 1,
        justifyContent: 'flex-end',
    },
    dismissArea: {
        flex: 1,
    },
    sheetSafeArea: {
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        backgroundColor: homeDashboardColors.surfaceStrong,
        borderColor: homeDashboardColors.line,
        borderTopLeftRadius: homeDashboardRadii.xl,
        borderTopRightRadius: homeDashboardRadii.xl,
        borderWidth: 1,
        maxHeight: '72%',
        overflow: 'hidden',
        paddingHorizontal: homeDashboardSpacing.md,
        paddingTop: homeDashboardSpacing.xs,
    },
    sheetContainerDark: {
        backgroundColor: 'rgba(12, 18, 30, 0.98)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    sheetContent: {
        gap: homeDashboardSpacing.sm,
        paddingBottom: homeDashboardSpacing.xxl,
        zIndex: 1,
    },
    handle: {
        alignSelf: 'center',
        backgroundColor: homeDashboardColors.lineStrong,
        borderRadius: homeDashboardRadii.pill,
        height: 4,
        marginBottom: homeDashboardSpacing.xs,
        width: 40,
    },
    headerRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: homeDashboardSpacing.xs,
    },
    title: {
        color: homeDashboardColors.ink,
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.4,
        lineHeight: 24,
    },
    titleDark: {
        color: homeDashboardColors.pearlIvory,
    },
    closeButton: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 252, 247, 0.88)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        height: 32,
        justifyContent: 'center',
        width: 32,
    },
    closeButtonDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: homeDashboardSpacing.sm,
        paddingBottom: homeDashboardSpacing.sm,
        paddingHorizontal: homeDashboardSpacing.xs,
        paddingTop: homeDashboardSpacing.xs,
    },
    avatarCard: {
        aspectRatio: 1,
        backgroundColor: 'rgba(255, 252, 247, 0.84)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.lg,
        borderWidth: 1,
        overflow: 'hidden',
        position: 'relative',
        width: '31%',
    },
    avatarCardDark: {
        backgroundColor: 'rgba(16, 23, 37, 0.84)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    avatarCardSelected: {
        borderColor: homeDashboardColors.accentBlue,
        boxShadow: '0 12px 24px rgba(34, 29, 20, 0.08)',
    },
    avatarImage: {
        height: '100%',
        width: '100%',
    },
    selectedBadge: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.accentBlue,
        borderRadius: homeDashboardRadii.pill,
        height: 24,
        justifyContent: 'center',
        position: 'absolute',
        right: homeDashboardSpacing.xs,
        top: homeDashboardSpacing.xs,
        width: 24,
    },
});
