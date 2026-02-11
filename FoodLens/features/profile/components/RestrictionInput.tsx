import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';

type RestrictionInputProps = {
    theme: ProfileTheme;
    inputValue: string;
    suggestions: string[];
    onChangeText: (text: string) => void;
    onSubmit: () => void;
    onSelectSuggestion: (item: string) => void;
};

export default function RestrictionInput({
    theme,
    inputValue,
    suggestions,
    onChangeText,
    onSubmit,
    onSelectSuggestion,
}: RestrictionInputProps) {
    return (
        <View style={{ zIndex: 10 }}>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
                <Ionicons name="search" size={20} color={theme.textSecondary} style={{ marginRight: 10 }} />
                <TextInput
                    style={[styles.input, { color: theme.textPrimary }]}
                    placeholder="Type (e.g. Peach, Vegan)..."
                    placeholderTextColor={theme.textSecondary}
                    value={inputValue}
                    onChangeText={onChangeText}
                    onSubmitEditing={onSubmit}
                    returnKeyType="done"
                />
                {inputValue.length > 0 && (
                    <TouchableOpacity onPress={onSubmit}>
                        <Ionicons name="add-circle" size={28} color={theme.primary} />
                    </TouchableOpacity>
                )}
            </View>

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
                        <TouchableOpacity
                            key={`${item}-${index}`}
                            style={[styles.suggestionItem, { borderBottomColor: theme.border }]}
                            onPress={() => onSelectSuggestion(item)}
                        >
                            <Ionicons name="add" size={16} color={theme.primary} style={{ marginRight: 8 }} />
                            <Text style={[styles.suggestionText, { color: theme.textPrimary }]}>{item}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}
