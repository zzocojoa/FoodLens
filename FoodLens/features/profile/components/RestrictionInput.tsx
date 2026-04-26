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
    return (
        <View style={styles.inputSection}>
            {suggestions.length > 0 && (
                <View
                    style={[
                        styles.suggestionsDropdown,
                        {
                            borderColor: homeDashboardColors.line,
                            backgroundColor: homeDashboardColors.surfaceStrong,
                            shadowColor: theme.shadow,
                        },
                    ]}
                >
                    {suggestions.map((item, index) => (
                        <Pressable
                            key={`${item.value}-${index}`}
                            style={[styles.suggestionItem, { borderBottomColor: homeDashboardColors.line }]}
                            onPress={() => onSelectSuggestion(item.value)}
                            accessibilityRole="button"
                            accessibilityLabel={item.label}
                        >
                            <View style={styles.suggestionIconSlot}>
                                <Plus size={17} color={homeDashboardColors.ink} />
                            </View>
                            <Text numberOfLines={2} style={styles.suggestionText}>{item.label}</Text>
                        </Pressable>
                    ))}
                </View>
            )}

            <View style={[styles.inputWrapper, { shadowColor: theme.shadow }]}>
                <View style={styles.inputIconSlot}>
                    <Search size={20} color={homeDashboardColors.inkSoft} />
                </View>
                <TextInput
                    style={styles.input}
                    placeholder={t('profile.input.placeholder', 'Type (e.g. Peach, Pine nut)...')}
                    placeholderTextColor={homeDashboardColors.inkSoft}
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
                            <CirclePlus size={24} color={homeDashboardColors.ink} />
                        </Pressable>
                    ) : null}
                </View>
            </View>
        </View>
    );
}
