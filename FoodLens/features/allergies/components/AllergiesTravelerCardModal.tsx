import React, { type ReactNode } from 'react';
import {
    type GestureResponderEvent,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import {
    allergiesDashboardStyles as styles,
} from './allergiesDashboardStyles';
import {
    type AllergiesDashboardColors,
} from './allergiesDashboardTokens';
import { useI18n } from '@/features/i18n';

export type AllergiesTravelerCardModalProps = {
    visible: boolean;
    onClose: () => void;
    colors: AllergiesDashboardColors;
    children: ReactNode;
};

export default function AllergiesTravelerCardModal({
    visible,
    onClose,
    colors,
    children,
}: AllergiesTravelerCardModalProps): React.JSX.Element {
    const { t } = useI18n();
    const handleSheetPress = React.useCallback((event: GestureResponderEvent): void => {
        event.stopPropagation();
    }, []);

    return (
        <Modal
            transparent={true}
            animationType="fade"
            visible={visible}
            onRequestClose={onClose}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('allergies.modal.closeBackdropLabel', 'Close traveler card')}
                accessibilityHint={t('allergies.modal.closeBackdropHint', 'Closes the expanded traveler card')}
                onPress={onClose}
                style={styles.modalBackdrop}
                testID="allergies-traveler-card-backdrop"
            >
                <SafeAreaView pointerEvents="box-none" style={styles.modalSafeArea}>
                    <Pressable
                        accessibilityRole="none"
                        onPress={handleSheetPress}
                        style={[
                            styles.modalSheet,
                            { backgroundColor: colors.surfaceStrong, borderColor: colors.lineStrong },
                        ]}
                        testID="allergies-traveler-card-sheet"
                    >
                        <View style={[styles.modalHeader, { borderColor: colors.line }]}>
                            <Text style={[styles.modalTitle, { color: colors.ink }]}>
                                {t('allergies.modal.title', 'Traveler Card')}
                            </Text>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t('allergies.modal.closeLabel', 'Close')}
                                accessibilityHint={t('allergies.modal.closeHint', 'Closes the traveler card modal')}
                                hitSlop={10}
                                onPress={onClose}
                                style={[
                                    styles.modalCloseButton,
                                    { backgroundColor: colors.surfaceMuted, borderColor: colors.lineStrong },
                                ]}
                                testID="allergies-traveler-card-close"
                            >
                                <X color={colors.ink} size={18} strokeWidth={2.4} />
                            </Pressable>
                        </View>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.modalContent}
                        >
                            <View testID="allergies-traveler-card-body">
                                {children}
                            </View>
                        </ScrollView>
                    </Pressable>
                </SafeAreaView>
            </Pressable>
        </Modal>
    );
}
