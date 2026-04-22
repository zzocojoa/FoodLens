import React from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import PearlSurfaceOverlay from '@/features/home/components/PearlSurfaceOverlay';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardSpacing,
    homeDashboardTypography,
} from '@/features/home/components/homeDashboardTokens';

type DeveloperRow = {
    label: string;
    value: string;
};

type ProfileDeveloperSheetProps = {
    visible: boolean;
    title: string;
    closeLabel: string;
    rows: DeveloperRow[];
    onClose: () => void;
};

export default function ProfileDeveloperSheet({
    visible,
    title,
    closeLabel,
    rows,
    onClose,
}: ProfileDeveloperSheetProps): React.JSX.Element | null {
    if (!visible) {
        return null;
    }

    return (
        <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
            <View style={styles.overlay}>
                <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.dismissArea} />

                <SafeAreaView edges={['bottom']} style={styles.sheetSafeArea}>
                    <View style={styles.sheetContainer}>
                        <PearlSurfaceOverlay
                            accentWashColor={homeDashboardColors.pearlMist}
                            baseBottomColor={homeDashboardColors.paperStrong}
                            baseTopColor={homeDashboardColors.pearlIvory}
                            coolWashColor={homeDashboardColors.pearlGlow}
                            warmWashColor={homeDashboardColors.pearlPeach}
                        />

                        <View style={styles.sheetContent}>
                            <View style={styles.handle} />

                            <View style={styles.headerRow}>
                                <Text style={styles.title}>{title}</Text>
                                <HapticTouchableOpacity
                                    accessibilityLabel={closeLabel}
                                    accessibilityRole="button"
                                    activeOpacity={0.9}
                                    hapticType="light"
                                    onPress={onClose}
                                    style={styles.closeButton}
                                >
                                    <X color={homeDashboardColors.inkSoft} size={16} />
                                </HapticTouchableOpacity>
                            </View>

                            <ScrollView
                                keyboardDismissMode="on-drag"
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                <View style={styles.rowList}>
                                    {rows.map((row, index) => (
                                        <View
                                            key={row.label}
                                            style={[
                                                styles.rowCard,
                                                index === rows.length - 1 ? styles.rowCardLast : null,
                                            ]}
                                        >
                                            <Text style={styles.rowLabel}>{row.label}</Text>
                                            <Text selectable style={styles.rowValue}>
                                                {row.value}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
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
        backgroundColor: 'rgba(23, 32, 51, 0.22)',
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
        borderColor: homeDashboardColors.line,
        borderTopLeftRadius: homeDashboardRadii.xl,
        borderTopRightRadius: homeDashboardRadii.xl,
        borderWidth: 1,
        maxHeight: '78%',
        overflow: 'hidden',
        paddingHorizontal: homeDashboardSpacing.lg,
        paddingTop: homeDashboardSpacing.sm,
        position: 'relative',
    },
    sheetContent: {
        gap: homeDashboardSpacing.md,
        paddingBottom: homeDashboardSpacing.xl,
        zIndex: 1,
    },
    handle: {
        alignSelf: 'center',
        backgroundColor: homeDashboardColors.lineStrong,
        borderRadius: homeDashboardRadii.pill,
        height: 5,
        width: 44,
    },
    headerRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    title: {
        color: homeDashboardColors.ink,
        fontSize: homeDashboardTypography.section,
        fontWeight: '800',
        letterSpacing: -0.6,
        lineHeight: 28,
    },
    closeButton: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 252, 247, 0.88)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        height: 34,
        justifyContent: 'center',
        width: 34,
    },
    rowList: {
        gap: homeDashboardSpacing.sm,
    },
    rowCard: {
        backgroundColor: 'rgba(255, 252, 247, 0.9)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.lg,
        borderWidth: 1,
        gap: homeDashboardSpacing.xs,
        paddingHorizontal: homeDashboardSpacing.md,
        paddingVertical: homeDashboardSpacing.sm,
    },
    rowCardLast: {
        marginBottom: homeDashboardSpacing.xs,
    },
    rowLabel: {
        color: homeDashboardColors.inkSoft,
        fontSize: homeDashboardTypography.caption,
        fontWeight: '700',
        letterSpacing: 0.6,
        lineHeight: 14,
        textTransform: 'uppercase',
    },
    rowValue: {
        color: homeDashboardColors.ink,
        fontSize: homeDashboardTypography.body,
        fontWeight: '600',
        lineHeight: 18,
    },
});
