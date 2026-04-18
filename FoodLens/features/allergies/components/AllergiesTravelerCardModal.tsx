import React, { ReactNode } from 'react';
import {
    GestureResponderEvent,
    Modal,
    Pressable,
    ScrollView,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    allergiesDashboardStyles as styles,
} from './allergiesDashboardStyles';

export type AllergiesTravelerCardModalProps = {
    visible: boolean;
    onClose: () => void;
    children: ReactNode;
};

export default function AllergiesTravelerCardModal({
    visible,
    onClose,
    children,
}: AllergiesTravelerCardModalProps) {
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
                onPress={onClose}
                style={styles.modalBackdrop}
                testID="allergies-traveler-card-backdrop"
            >
                <SafeAreaView pointerEvents="box-none" style={styles.modalSafeArea}>
                    <Pressable
                        accessibilityRole="none"
                        onPress={handleSheetPress}
                        style={styles.modalSheet}
                        testID="allergies-traveler-card-sheet"
                    >
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.modalContent}
                        >
                            <View
                                style={styles.modalBodyFrame}
                                testID="allergies-traveler-card-body"
                            >
                                {children}
                            </View>
                        </ScrollView>
                    </Pressable>
                </SafeAreaView>
            </Pressable>
        </Modal>
    );
}
