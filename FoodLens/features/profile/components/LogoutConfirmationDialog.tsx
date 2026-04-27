import React from 'react';
import {
    AccessibilityInfo,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { Colors, type ColorSchemeName } from '@/constants/theme';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardSpacing,
    homeDashboardTypography,
} from '@/features/home/components/homeDashboardTokens';

type LogoutConfirmationDialogProps = {
    visible: boolean;
    colorScheme: ColorSchemeName;
    title: string;
    message: string;
    cancelLabel: string;
    confirmLabel: string;
    dialogAccessibilityLabel: string;
    cancelAccessibilityLabel: string;
    cancelAccessibilityHint: string;
    confirmAccessibilityLabel: string;
    confirmAccessibilityHint: string;
    onCancel: () => void;
    onConfirm: () => void;
};

type LogoutConfirmationDialogTone = {
    overlay: string;
    surface: string;
    border: string;
    title: string;
    message: string;
    cancelBackground: string;
    cancelBorder: string;
    cancelText: string;
    confirmBackground: string;
    confirmBorder: string;
    confirmText: string;
};

const buildLogoutConfirmationDialogTone = (colorScheme: ColorSchemeName): LogoutConfirmationDialogTone => {
    if (colorScheme === 'dark') {
        return {
            overlay: 'rgba(2, 6, 23, 0.68)',
            surface: 'rgba(10, 16, 28, 0.98)',
            border: 'rgba(255, 255, 255, 0.12)',
            title: Colors.dark.textPrimary,
            message: Colors.dark.textSecondary,
            cancelBackground: 'rgba(20, 29, 45, 0.92)',
            cancelBorder: 'rgba(148, 163, 184, 0.22)',
            cancelText: Colors.dark.textPrimary,
            confirmBackground: homeDashboardColors.accentRed,
            confirmBorder: 'rgba(255, 231, 229, 0.16)',
            confirmText: homeDashboardColors.pearlIvory,
        };
    }

    return {
        overlay: 'rgba(23, 32, 51, 0.34)',
        surface: homeDashboardColors.pearlIvory,
        border: homeDashboardColors.lineStrong,
        title: homeDashboardColors.ink,
        message: homeDashboardColors.inkSoft,
        cancelBackground: homeDashboardColors.white,
        cancelBorder: homeDashboardColors.line,
        cancelText: homeDashboardColors.ink,
        confirmBackground: homeDashboardColors.accentRed,
        confirmBorder: homeDashboardColors.accentRed,
        confirmText: homeDashboardColors.pearlIvory,
    };
};

export default function LogoutConfirmationDialog({
    visible,
    colorScheme,
    title,
    message,
    cancelLabel,
    confirmLabel,
    dialogAccessibilityLabel,
    cancelAccessibilityLabel,
    cancelAccessibilityHint,
    confirmAccessibilityLabel,
    confirmAccessibilityHint,
    onCancel,
    onConfirm,
}: LogoutConfirmationDialogProps): React.JSX.Element | null {
    const titleRef = React.useRef<React.ElementRef<typeof Text>>(null);
    const tone = React.useMemo<LogoutConfirmationDialogTone>(
        () => buildLogoutConfirmationDialogTone(colorScheme),
        [colorScheme],
    );

    const handleModalShow = React.useCallback((): void => {
        const reactTag = findNodeHandle(titleRef.current);

        if (reactTag === null) {
            return;
        }

        AccessibilityInfo.setAccessibilityFocus(reactTag);
    }, []);

    if (!visible) {
        return null;
    }

    return (
        <Modal
            animationType="fade"
            onRequestClose={onCancel}
            onShow={handleModalShow}
            statusBarTranslucent
            transparent
            visible={visible}
        >
            <View
                accessibilityLabel={dialogAccessibilityLabel}
                accessibilityViewIsModal
                importantForAccessibility="yes"
                style={[styles.overlay, { backgroundColor: tone.overlay }]}
            >
                <TouchableOpacity
                    accessibilityElementsHidden
                    activeOpacity={1}
                    importantForAccessibility="no-hide-descendants"
                    onPress={onCancel}
                    style={styles.dismissArea}
                />

                <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
                    <View style={[styles.dialog, { backgroundColor: tone.surface, borderColor: tone.border }]}>
                        <View style={styles.content}>
                            <View style={styles.copy}>
                                <Text
                                    accessibilityRole="header"
                                    ref={titleRef}
                                    style={[styles.title, { color: tone.title }]}
                                >
                                    {title}
                                </Text>
                                <Text style={[styles.message, { color: tone.message }]}>
                                    {message}
                                </Text>
                            </View>

                            <View style={styles.actions}>
                                <HapticTouchableOpacity
                                    accessibilityHint={cancelAccessibilityHint}
                                    accessibilityLabel={cancelAccessibilityLabel}
                                    accessibilityRole="button"
                                    activeOpacity={0.9}
                                    hapticType="selection"
                                    onPress={onCancel}
                                    style={[
                                        styles.actionButton,
                                        { backgroundColor: tone.cancelBackground, borderColor: tone.cancelBorder },
                                    ]}
                                >
                                    <Text style={[styles.cancelText, { color: tone.cancelText }]}>
                                        {cancelLabel}
                                    </Text>
                                </HapticTouchableOpacity>

                                <HapticTouchableOpacity
                                    accessibilityHint={confirmAccessibilityHint}
                                    accessibilityLabel={confirmAccessibilityLabel}
                                    accessibilityRole="button"
                                    activeOpacity={0.9}
                                    hapticType="warning"
                                    onPress={onConfirm}
                                    style={[
                                        styles.actionButton,
                                        { backgroundColor: tone.confirmBackground, borderColor: tone.confirmBorder },
                                    ]}
                                >
                                    <Text style={[styles.confirmText, { color: tone.confirmText }]}>
                                        {confirmLabel}
                                    </Text>
                                </HapticTouchableOpacity>
                            </View>
                        </View>
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
    },
    dismissArea: {
        ...StyleSheet.absoluteFillObject,
    },
    safeArea: {
        paddingHorizontal: homeDashboardSpacing.lg,
    },
    dialog: {
        alignSelf: 'center',
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.lg,
        borderWidth: 1,
        maxWidth: 360,
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
    },
    content: {
        gap: homeDashboardSpacing.md,
        padding: homeDashboardSpacing.lg,
    },
    copy: {
        gap: homeDashboardSpacing.sm,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        lineHeight: 26,
        textAlign: 'center',
    },
    message: {
        fontSize: homeDashboardTypography.body,
        fontWeight: '500',
        lineHeight: 21,
        textAlign: 'center',
    },
    actions: {
        gap: homeDashboardSpacing.sm,
    },
    actionButton: {
        alignItems: 'center',
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.sm,
        borderWidth: 1,
        justifyContent: 'center',
        minHeight: 52,
        paddingHorizontal: homeDashboardSpacing.md,
        paddingVertical: homeDashboardSpacing.sm,
    },
    cancelText: {
        alignSelf: 'stretch',
        flexShrink: 1,
        fontSize: homeDashboardTypography.body,
        fontWeight: '800',
        lineHeight: 22,
        textAlign: 'center',
    },
    confirmText: {
        alignSelf: 'stretch',
        flexShrink: 1,
        fontSize: homeDashboardTypography.body,
        fontWeight: '800',
        lineHeight: 22,
        textAlign: 'center',
    },
});
