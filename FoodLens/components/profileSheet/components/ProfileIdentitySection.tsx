import React from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { Camera, Edit3, Image as ImageIcon } from 'lucide-react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { profileSheetStyles as styles } from '../styles';

type ProfileIdentitySectionProps = {
    theme: any;
    colorScheme: string;
    name: string;
    image: string;
    avatars: string[];
    onChangeName: (value: string) => void;
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
    onPickCamera,
    onPickLibrary,
    onSelectPreset,
}: ProfileIdentitySectionProps) {
    return (
        <View style={styles.section}>
            <View style={styles.avatarWrapper}>
                <View style={[styles.avatarFrame, { backgroundColor: theme.surface, borderColor: theme.surface }]}>
                    <Image source={{ uri: image }} style={styles.avatarImage} />
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
                <Text style={styles.label}>DISPLAY NAME</Text>
                <View style={styles.inputWrapper}>
                    <TextInput
                        value={name}
                        onChangeText={onChangeName}
                        style={[
                            styles.textInput,
                            { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
                        ]}
                        placeholder="Enter your name"
                        placeholderTextColor={theme.textSecondary}
                    />
                    <Edit3 size={16} color={theme.textSecondary} style={{ position: 'absolute', right: 20 }} />
                </View>
            </View>

            <View>
                <Text style={[styles.label, { marginBottom: 12 }]}>PRESETS</Text>
                <View style={styles.presetGrid}>
                    {avatars.map((url, idx) => (
                        <HapticTouchableOpacity
                            key={idx}
                            onPress={() => onSelectPreset(url)}
                            style={[
                                styles.presetItem,
                                { backgroundColor: theme.surface, borderColor: 'transparent' },
                                image === url && {
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
                            <Text style={styles.uploadText}>Upload</Text>
                        </View>
                    </HapticTouchableOpacity>
                </View>
            </View>
        </View>
    );
}
