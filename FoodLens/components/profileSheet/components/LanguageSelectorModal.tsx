import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View, Animated as RNAnimated } from 'react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { LanguageOption } from '../types';
import { profileSheetStyles as styles } from '../styles';

type LanguageSelectorModalProps = {
    visible: boolean;
    title: string;
    options: LanguageOption[];
    selectedCode?: string;
    colorScheme: string;
    theme: any;
    panY: RNAnimated.Value;
    panHandlers: any;
    onClose: () => void;
    onSelectLanguage: (code: string) => void;
    normalizeForSelection?: (code?: string | null) => string | null;
};

export default function LanguageSelectorModal({
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
}: LanguageSelectorModalProps) {
    const normalize =
        normalizeForSelection ||
        ((code?: string | null) => (code ? code.trim() : null));
    const normalizedSelected = normalize(selectedCode);

    const isSelected = (optionCode: string) => {
        const normalizedOption = normalize(optionCode);
        return normalizedOption === normalizedSelected;
    };

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
            <TouchableOpacity activeOpacity={1} style={styles.overlay} onPress={onClose}>
                <RNAnimated.View
                    style={[
                        styles.sheetContainer,
                        {
                            height: '55%',
                            transform: [{ translateY: panY }],
                            backgroundColor: theme.background,
                        },
                    ]}
                >
                    <View {...panHandlers} style={styles.swipeHandleWrapper}>
                        <View style={styles.swipeHandle} />
                    </View>

                    <View {...panHandlers} style={[styles.header, { marginBottom: 20, justifyContent: 'center' }]}>
                        <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {options.map((opt) => (
                            <HapticTouchableOpacity
                                key={opt.code}
                                style={[
                                    styles.menuItem,
                                    {
                                        marginBottom: 8,
                                        backgroundColor:
                                            isSelected(opt.code)
                                                ? colorScheme === 'dark'
                                                    ? 'rgba(59, 130, 246, 0.2)'
                                                    : '#F0F9FF'
                                                : theme.surface,
                                        borderColor: theme.border,
                                        borderWidth: 1,
                                    },
                                ]}
                                onPress={() => onSelectLanguage(opt.code)}
                                hapticType="selection"
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <Text style={{ fontSize: 24 }}>{opt.flag}</Text>
                                    <Text style={[styles.menuTitle, { fontSize: 18, color: theme.textPrimary }]}>{opt.label}</Text>
                                </View>
                                {isSelected(opt.code) && (
                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6' }} />
                                )}
                            </HapticTouchableOpacity>
                        ))}
                    </ScrollView>
                </RNAnimated.View>
            </TouchableOpacity>
        </Modal>
    );
}
