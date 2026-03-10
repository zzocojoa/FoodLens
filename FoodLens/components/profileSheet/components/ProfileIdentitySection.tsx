import React from 'react';
import { Image, Keyboard, Text, TextInput, View } from 'react-native';
import { Camera, Edit3, Image as ImageIcon } from 'lucide-react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { profileSheetStyles as styles } from '../styles';
import { useI18n } from '@/features/i18n';

type ProfileIdentitySectionProps = {
    theme: any;
    colorScheme: string;
    name: string;
    image?: string;
    avatars: string[];
    onChangeName: (value: string) => void;
    onClearName: () => void;
    onPickCamera: () => void;
    onPickLibrary: () => void;
    onSelectPreset: (url: string) => void;
};

export default function ProfileIdentitySection({
    theme,
    colorScheme,
    name,
    image,
    avatars,
    onChangeName,
    onClearName,
    onPickCamera,
    onPickLibrary,
    onSelectPreset,
}: ProfileIdentitySectionProps) {
    const { t } = useI18n();
    const hasImage = typeof image === 'string' && image.trim().length > 0;
    return (
        <View style={styles.section}>
            <View style={styles.avatarWrapper}>
                <View style={[styles.avatarFrame, { backgroundColor: theme.surface, borderColor: theme.surface }]}>
                    {hasImage ? (
                        <Image source={{ uri: image }} style={styles.avatarImage} />
                    ) : (
                        <View
                            style={[
                                styles.avatarImage,
                                { backgroundColor: colorScheme === 'dark' ? theme.border : '#E2E8F0' },
                            ]}
                        />
                    )}
                </View>
                <HapticTouchableOpacity
                    onPress={onPickCamera}
                    style={[styles.cameraBtn, { backgroundColor: theme.textPrimary, borderColor: theme.background }]}
                    hapticType="light"
                >
                    <Camera size={16} color={theme.background} />
                </HapticTouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('profileSheet.identity.displayName', 'DISPLAY NAME')}</Text>
                <View style={styles.inputWrapper}>
                    <TextInput
                        value={name}
                        onChangeText={onChangeName}
                        style={[
                            styles.textInput,
                            { paddingRight: 56 },
                            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
                        ]}
                        placeholder={t('profileSheet.identity.namePlaceholder', 'Enter your name')}
                        placeholderTextColor={theme.textSecondary}
                    />
                    <HapticTouchableOpacity
                        onPress={() => {
                            Keyboard.dismiss();
                            requestAnimationFrame(() => {
                                onClearName();
                            });
                        }}
                        style={{
                            position: 'absolute',
                            right: 10,
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2,
                            elevation: 3,
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        hapticType="selection"
                        accessibilityRole="button"
                        accessibilityLabel={t('profileSheet.identity.clearDisplayName', 'Clear display name')}
                    >
                        <Edit3 size={16} color={theme.textSecondary} />
                    </HapticTouchableOpacity>
                </View>
            </View>

            <View>
                <Text style={[styles.label, { marginBottom: 12 }]}>{t('profileSheet.identity.presets', 'PRESETS')}</Text>
                <View style={styles.presetGrid}>
                    {avatars.map((url, idx) => (
                        <HapticTouchableOpacity
                            key={idx}
                            onPress={() => onSelectPreset(url)}
                            style={[
                                styles.presetItem,
                                { backgroundColor: theme.surface, borderColor: 'transparent' },
                                hasImage && image === url && {
                                    borderColor: theme.primary,
                                    backgroundColor: colorScheme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
                                },
                            ]}
                            hapticType="selection"
                        >
                            <Image source={{ uri: url }} style={styles.presetImage} />
                        </HapticTouchableOpacity>
                    ))}
                    <HapticTouchableOpacity
                        onPress={onPickLibrary}
                        style={[styles.uploadBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                        hapticType="light"
                    >
                        <View pointerEvents="none" style={{ alignItems: 'center', gap: 4 }}>
                            <ImageIcon size={18} color={theme.textSecondary} />
                            <Text style={styles.uploadText}>{t('profileSheet.identity.upload', 'Upload')}</Text>
                        </View>
                    </HapticTouchableOpacity>
                </View>
            </View>
        </View>
    );
}
