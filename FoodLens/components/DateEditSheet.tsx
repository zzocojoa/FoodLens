import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';

interface DateEditSheetProps {
    isVisible: boolean;
    initialDate: Date;
    onClose: () => void;
    onConfirm: (date: Date) => void;
}

export function DateEditSheet({ isVisible, initialDate, onClose, onConfirm }: DateEditSheetProps) {
    const [tempDate, setTempDate] = useState(initialDate);

    const handleChange = (event: any, selectedDate?: Date) => {
        if (selectedDate) {
            setTempDate(selectedDate);
        }
    };

    if (!isVisible) return null;

    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                {/* Close on background tap */}
                <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
                
                <View style={styles.sheetContainer}>
                    <BlurView intensity={80} tint="light" style={styles.blurContainer}>
                        <View style={styles.header}>
                            <View style={styles.handle} />
                            <Text style={styles.title}>편집</Text>
                        </View>

                        <View style={styles.pickerContainer}>
                            <DateTimePicker
                                value={tempDate}
                                mode="datetime"
                                display="spinner"
                                onChange={handleChange}
                                textColor="black"
                                locale="ko-KR" // Korean locale
                                themeVariant="light"
                                style={{ height: 180, width: '100%' }}
                            />
                        </View>

                        <View style={styles.footer}>
                            <TouchableOpacity style={styles.confirmButton} onPress={() => onConfirm(tempDate)}>
                                <Text style={styles.confirmText}>완료</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                                <Text style={styles.cancelText}>취소</Text>
                            </TouchableOpacity>
                        </View>
                    </BlurView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        margin: 10,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 20, // Floating feeling
        backgroundColor: 'white',
    },
    blurContainer: {
        padding: 20,
        alignItems: 'center',
    },
    header: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 20,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#E2E8F0',
        borderRadius: 2,
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0F172A',
    },
    pickerContainer: {
        width: '100%',
        height: 180,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    footer: {
        width: '100%',
        gap: 12,
    },
    confirmButton: {
        backgroundColor: '#1E1E1E', // Black button per screenshot
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    confirmText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelButton: {
        backgroundColor: '#F3F4F6', // Light gray button
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    cancelText: {
        color: '#0F172A',
        fontSize: 16,
        fontWeight: '600',
    }
});
