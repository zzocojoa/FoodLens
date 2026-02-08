import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { UserService } from '@/services/userService';
import { UserProfile } from '@/models/User';
import { HapticsService } from '@/services/haptics';

const EMOJI_OPTIONS = [
  '🍎', '🍏', '🍊', '🍋', '🍇', '🍓',
  '🥝', '🥑', '🍑', '🍒', '🫐', '🍌',
  '🍉', '🥭', '🍐', '🍈', '🫒', '🥥'
];

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function EmojiPickerScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [selectedEmoji, setSelectedEmoji] = useState<string>('🍎');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const profile = await UserService.getUserProfile('test-user-v1');
      if (profile) {
        setUserProfile(profile);
        setSelectedEmoji(profile.settings?.selectedEmoji || '🍎');
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
    }
  };

  const handleSelectEmoji = async (emoji: string) => {
    if (!userProfile || isSaving) return;
    
    setIsSaving(true);
    HapticsService.medium();
    setSelectedEmoji(emoji);
    
    try {
      await UserService.updateUserProfile(userProfile.uid, {
        settings: {
          ...userProfile.settings,
          selectedEmoji: emoji,
        },
      });
      // router.back(); // Removed auto-navigation
    } catch (e) {
      console.error('Failed to save emoji:', e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.background}]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={[styles.backButton, {backgroundColor: theme.glass, borderColor: theme.border}]}
          hitSlop={15}
        >
          <View pointerEvents="none">
            <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: theme.textPrimary}]}>이모지 선택</Text>
        <View style={{ width: 40, height: 40 }} />
      </View>

      {/* Preview */}
      <View style={styles.previewContainer}>
        <BlurView intensity={80} tint={colorScheme === 'dark' ? 'dark' : 'light'} style={[styles.previewCard, {backgroundColor: theme.glass}]}>
          <Text style={styles.previewEmoji}>{selectedEmoji}</Text>
          <Text style={[styles.previewLabel, {color: theme.textSecondary}]}>미리보기</Text>
        </BlurView>
      </View>

      {/* Emoji Grid */}
      <ScrollView contentContainerStyle={styles.gridContainer}>
        <Text style={[styles.sectionTitle, {color: theme.textPrimary}]}>이모지 선택</Text>
        <View style={styles.grid}>
          {EMOJI_OPTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[
                styles.emojiItem,
                {backgroundColor: theme.surface},
                selectedEmoji === emoji && {borderColor: theme.primary, borderWidth: 2},
              ]}
              onPress={() => handleSelectEmoji(emoji)}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
              {selectedEmoji === emoji && (
                <View style={[styles.checkBadge, {backgroundColor: theme.primary}]}>
                  <Check size={12} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: THEME.background, // Set dynamically
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  previewContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  previewCard: {
    width: 160,
    height: 160,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewEmoji: {
    fontSize: 80,
  },
  previewLabel: {
    marginTop: 8,
    fontSize: 14,
  },
  gridContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  emojiItem: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emojiItemSelected: {
    borderWidth: 2,
    // borderColor handled dynamically
  },
  emojiText: {
    fontSize: 32,
  },
  checkBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
