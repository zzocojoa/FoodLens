import React from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import AllergenGrid from '../components/AllergenGrid';
import ProfileHeader from '../components/ProfileHeader';
import RestrictionInput from '../components/RestrictionInput';
import RestrictionTags from '../components/RestrictionTags';
import SaveProfileFooter from '../components/SaveProfileFooter';
import { useProfileScreen } from '../hooks/useProfileScreen';
import { profileStyles as styles } from '../styles/profileStyles';

export default function ProfileScreen() {
    const router = useRouter();
    const { colorScheme } = useTheme();
    const theme = Colors[colorScheme];
    const insets = useSafeAreaInsets();

    const {
        loading,
        inputValue,
        allergies,
        otherRestrictions,
        suggestions,
        scrollViewRef,
        shouldScrollRef,
        toggleAllergen,
        handleInputChange,
        addOtherRestriction,
        removeRestriction,
        selectSuggestion,
        saveProfile,
    } = useProfileScreen();

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
            <ProfileHeader theme={theme} onBack={() => router.back()} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView
                    ref={scrollViewRef}
                    style={styles.container}
                    contentContainerStyle={{
                        paddingBottom: otherRestrictions.length === 0 ? insets.bottom + 40 : insets.bottom + 150,
                    }}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => {
                        if (shouldScrollRef.current) {
                            scrollViewRef.current?.scrollToEnd({ animated: true });
                            shouldScrollRef.current = false;
                        }
                    }}
                >
                    <View style={styles.heroSection}>
                        <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>What should we avoid?</Text>
                        <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>Select ingredients you are allergic to or cannot eat.</Text>
                    </View>

                    <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>Common Allergens</Text>
                    <AllergenGrid
                        theme={theme}
                        selectedAllergies={allergies}
                        onToggle={toggleAllergen}
                    />

                    <Text style={[styles.sectionHeader, { color: theme.textPrimary }]}>Other Restrictions</Text>
                    <RestrictionInput
                        theme={theme}
                        inputValue={inputValue}
                        suggestions={suggestions}
                        onChangeText={handleInputChange}
                        onSubmit={addOtherRestriction}
                        onSelectSuggestion={selectSuggestion}
                    />

                    <RestrictionTags theme={theme} items={otherRestrictions} onRemove={removeRestriction} />
                </ScrollView>
            </KeyboardAvoidingView>

            <SaveProfileFooter theme={theme} loading={loading} onSave={saveProfile} />
        </SafeAreaView>
    );
}
