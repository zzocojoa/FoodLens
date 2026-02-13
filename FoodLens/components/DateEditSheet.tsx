import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';
import { dateEditSheetStyles as styles } from './dateEditSheet/styles';
import { useDateEditSheetState } from './dateEditSheet/hooks/useDateEditSheetState';
import { DateEditSheetProps } from './dateEditSheet/types';

export function DateEditSheet({ isVisible, initialDate, onClose, onConfirm }: DateEditSheetProps) {
    const { tempDate, handleDateChange } = useDateEditSheetState(initialDate);

    if (!isVisible) return null;

    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
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
                                onChange={handleDateChange}
                                textColor="black"
                                locale="ko-KR"
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
