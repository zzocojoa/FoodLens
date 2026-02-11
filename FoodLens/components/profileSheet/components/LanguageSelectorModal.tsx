import React from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View, Animated as RNAnimated } from 'react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { LANGUAGE_OPTIONS } from '../constants';
import { profileSheetStyles as styles } from '../styles';

type LanguageSelectorModalProps = {
    visible: boolean;
    language?: string;
    colorScheme: string;
    theme: any;
    panY: RNAnimated.Value;
    panHandlers: any;
    onClose: () => void;
    onSelectLanguage: (code: string) => void;
};

export default function LanguageSelectorModal({
    visible,
    language,
    colorScheme,
    theme,
    panY,
    panHandlers,
    onClose,
    onSelectLanguage,
}: LanguageSelectorModalProps) {
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
                        <Text style={[styles.title, { color: theme.textPrimary }]}>Select Language</Text>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {LANGUAGE_OPTIONS.map((opt) => (
                            <HapticTouchableOpacity
                                key={opt.code}
                                style={[
                                    styles.menuItem,
                                    {
                                        marginBottom: 8,
                                        backgroundColor:
                                            language === opt.code || (!language && opt.code === 'GPS')
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
                                {(language === opt.code || (!language && opt.code === 'GPS')) && (
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
