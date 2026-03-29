import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import { SUPPORT_FAQ_CATEGORIES, SUPPORT_FAQ_ITEMS, type SupportFaqCategoryId } from '../supportContent';
import { getSupportAccentTextColor } from '../supportTheme';

const includesQuery = (value: string, query: string): boolean => value.toLowerCase().includes(query.toLowerCase());

export default function SupportFaqScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { colorScheme } = useTheme();
  const theme = Colors[colorScheme];
  const accentTextColor = getSupportAccentTextColor({ colorScheme, theme });
  const [searchText, setSearchText] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<SupportFaqCategoryId>('all');
  const [activeItemId, setActiveItemId] = React.useState<string | null>(null);

  const translatedCategories = React.useMemo(
    () =>
      SUPPORT_FAQ_CATEGORIES.map((category) => ({
        ...category,
        label: t(category.labelKey, category.labelFallback),
      })),
    [t],
  );

  const translatedItems = React.useMemo(
    () =>
      SUPPORT_FAQ_ITEMS.map((item) => ({
        ...item,
        question: t(item.questionKey, item.questionFallback),
        answer: t(item.answerKey, item.answerFallback),
      })),
    [t],
  );

  const filteredItems = React.useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return translatedItems.filter((item) => {
      const categoryMatches = selectedCategory === 'all' || item.categoryId === selectedCategory;
      if (!categoryMatches) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        includesQuery(item.question, query) ||
        includesQuery(item.answer, query) ||
        includesQuery(t(`support.faq.category.${item.categoryId}`, item.categoryId), query)
      );
    });
  }, [searchText, selectedCategory, t, translatedItems]);

  const contactSupport = React.useCallback(() => {
    router.push('/help/contact');
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('support.faq.title', 'Help Center'),
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: theme.textPrimary, fontSize: 30, fontWeight: '800', marginBottom: 8 }}>
          {t('support.faq.title', 'Help Center')}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 18 }}>
          {t(
            'support.faq.subtitle',
            'Search common questions or contact us if you still need help.',
          )}
        </Text>

        <View
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={t('support.faq.search.placeholder', 'Search questions')}
            placeholderTextColor={theme.textSecondary}
            style={{ flex: 1, color: theme.textPrimary, fontSize: 15 }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 18 }}>
          {translatedCategories.map((category) => {
            const isActive = category.id === selectedCategory;
            return (
              <Pressable
                key={category.id}
                onPress={() => setSelectedCategory(category.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: isActive ? theme.tint : theme.surface,
                  borderWidth: 1,
                  borderColor: isActive ? theme.tint : theme.border,
                }}
              >
                <Text
                  style={{
                    color: isActive ? accentTextColor : theme.textPrimary,
                    fontSize: 13,
                    fontWeight: '700',
                  }}
                >
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ gap: 12 }}>
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const isOpen = activeItemId === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setActiveItemId((previous) => (previous === item.id ? null : item.id))}
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderWidth: 1,
                    borderRadius: 18,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    gap: isOpen ? 10 : 0,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ flex: 1, color: theme.textPrimary, fontSize: 15, fontWeight: '700' }}>
                      {item.question}
                    </Text>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={theme.textSecondary}
                    />
                  </View>
                  {isOpen ? (
                    <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                      {item.answer}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })
          ) : (
            <View
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
                borderRadius: 18,
                padding: 16,
                gap: 10,
              }}
            >
              <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '700' }}>
                {t('support.faq.noResults.title', 'No matching questions')}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                {t(
                  'support.faq.noResults.subtitle',
                  'Try a different keyword or contact support for direct help.',
                )}
              </Text>
              <Pressable
                onPress={contactSupport}
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: theme.tint,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                }}
              >
                <Text style={{ color: accentTextColor, fontSize: 13, fontWeight: '800' }}>
                  {t('support.faq.contact.button', 'Contact Support')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View
          style={{
            marginTop: 18,
            backgroundColor: colorScheme === 'dark' ? 'rgba(96, 165, 250, 0.12)' : '#EFF6FF',
            borderColor: colorScheme === 'dark' ? 'rgba(96, 165, 250, 0.35)' : '#BFDBFE',
            borderWidth: 1,
            borderRadius: 18,
            padding: 16,
            gap: 10,
          }}
        >
          <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '800' }}>
            {t('support.faq.moreHelp.title', 'Still need help?')}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {t(
              'support.faq.moreHelp.subtitle',
              'Send us a message and include the details that matter most.',
            )}
          </Text>
          <Pressable
            onPress={contactSupport}
            style={{
              alignSelf: 'flex-start',
              backgroundColor: theme.tint,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: accentTextColor, fontSize: 13, fontWeight: '800' }}>
              {t('support.faq.moreHelp.button', 'Contact Support')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
