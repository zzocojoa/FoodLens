import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
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
        <View style={{ zIndex: 10 }}>
            <View style={[styles.inputWrapper, { shadowColor: theme.shadow }]}>
                <Search size={20} color={homeDashboardColors.inkSoft} style={{ marginRight: 10 }} />
                <TextInput
                    style={[styles.input, { color: homeDashboardColors.ink }]}
                    placeholder={t('profile.input.placeholder', 'Type (e.g. Peach, Vegan)...')}
                    placeholderTextColor={homeDashboardColors.inkSoft}
                    value={inputValue}
                    onChangeText={onChangeText}
                    onSubmitEditing={onSubmit}
                    returnKeyType="done"
                    accessibilityLabel={t('profile.input.placeholder', 'Type (e.g. Peach, Vegan)...')}
                />
                {inputValue.length > 0 && (
                    <TouchableOpacity
                        onPress={onSubmit}
                        accessibilityRole="button"
                        accessibilityLabel={t('profile.health.addTypedItem', 'Add typed item')}
                    >
                        <CirclePlus size={28} color={homeDashboardColors.ink} />
                    </TouchableOpacity>
                )}
            </View>

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
                        <TouchableOpacity
                            key={`${item.value}-${index}`}
                            style={[styles.suggestionItem, { borderBottomColor: homeDashboardColors.line }]}
                            onPress={() => onSelectSuggestion(item.value)}
                            accessibilityRole="button"
                            accessibilityLabel={item.label}
                        >
                            <Plus size={16} color={homeDashboardColors.ink} style={{ marginRight: 8 }} />
                            <Text style={[styles.suggestionText, { color: homeDashboardColors.ink }]}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}
