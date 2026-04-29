import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { CirclePlus, Plus, Search } from 'lucide-react-native';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';
import { IngredientSuggestion } from '../utils/profileSuggestions';
import { homeDashboardColors } from '@/features/home/components/homeDashboardTokens';

type RestrictionInputProps = {
    theme: ProfileTheme;
    inputValue: string;
    suggestions: IngredientSuggestion[];
    t: (key: string, fallback?: string) => string;
    onChangeText: (text: string) => void;
    onSubmit: () => void;
    onSelectSuggestion: (item: string) => void;
};

export default function RestrictionInput({
    theme,
    inputValue,
    suggestions,
    t,
    onChangeText,
    onSubmit,
    onSelectSuggestion,
}: RestrictionInputProps) {
    const iconBackgroundColor = theme.background;

    return (
        <View style={styles.inputSection}>
            {suggestions.length > 0 && (
                <View
                    style={[
                        styles.suggestionsDropdown,
                        {
                            borderColor: theme.border,
                            backgroundColor: theme.surface,
                            shadowColor: theme.shadow,
                        },
                    ]}
                >
                    {suggestions.map((item, index) => (
                        <Pressable
                            key={`${item.value}-${index}`}
                            style={[styles.suggestionItem, { borderBottomColor: theme.border }]}
                            onPress={() => onSelectSuggestion(item.value)}
                            accessibilityRole="button"
                            accessibilityLabel={item.label}
                        >
                            <View style={[styles.suggestionIconSlot, { backgroundColor: iconBackgroundColor }]}>
                                <Plus size={17} color={theme.textPrimary} />
                            </View>
                            <Text numberOfLines={2} style={[styles.suggestionText, { color: theme.textPrimary }]}>
                                {item.label}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            )}

            <View
                style={[
                    styles.inputWrapper,
                    {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        shadowColor: theme.shadow,
                    },
                ]}
            >
                <View style={[styles.inputIconSlot, { backgroundColor: iconBackgroundColor }]}>
                    <Search size={20} color={theme.textSecondary} />
                </View>
                <TextInput
                    style={[styles.input, { color: theme.textPrimary }]}
                    placeholder={t('profile.input.placeholder', 'Type (e.g. Peach, Pine nut)...')}
                    placeholderTextColor={theme.textSecondary}
                    value={inputValue}
                    onChangeText={onChangeText}
                    onSubmitEditing={onSubmit}
                    returnKeyType="done"
                    accessibilityLabel={t('profile.input.placeholder', 'Type (e.g. Peach, Pine nut)...')}
                />
                <View style={styles.inputActionSlot}>
                    {inputValue.length > 0 ? (
                        <Pressable
                            style={styles.inputActionButton}
                            onPress={onSubmit}
                            accessibilityRole="button"
                            accessibilityLabel={t('profile.health.addTypedItem', 'Add typed item')}
                        >
                            <CirclePlus size={24} color={theme.textPrimary} />
                        </Pressable>
                    ) : null}
                </View>
            </View>
        </View>
    );
}
