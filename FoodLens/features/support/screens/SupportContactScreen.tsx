import React from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import {
  buildSupportMailtoUrl,
  SUPPORT_EMAIL_ADDRESS,
  SUPPORT_FAQ_CATEGORIES,
  type SupportFaqTopicId,
} from '../supportContent';
import { openMailtoUrl } from '../supportMail';
import { getSupportAccentTextColor } from '../supportTheme';

type SupportContactParams = {
  topic?: string;
  analysisId?: string;
  foodName?: string;
  source?: string;
  subject?: string;
  message?: string;
};

const normalizeTopic = (value: string | undefined): SupportFaqTopicId => {
  const trimmed = (value ?? '').trim().toLowerCase();
  return SUPPORT_FAQ_CATEGORIES.some((category) => category.id === trimmed) ? (trimmed as SupportFaqTopicId) : 'analysis';
};

export default function SupportContactScreen() {
  const { t, locale } = useI18n();
  const { colorScheme } = useTheme();
  const theme = Colors[colorScheme];
  const accentTextColor = getSupportAccentTextColor({ colorScheme, theme });
  const params = useLocalSearchParams<SupportContactParams>();
  const initialTopic = normalizeTopic(params.topic);
  const [topic, setTopic] = React.useState<SupportFaqTopicId>(initialTopic);
  const [subject, setSubject] = React.useState(
    params.subject?.trim() || t('support.contact.subject.default', 'FoodLens support request'),
  );
  const [message, setMessage] = React.useState(params.message?.trim() || '');

  const translatedTopics = React.useMemo(
    () =>
      SUPPORT_FAQ_CATEGORIES.filter((category) => category.id !== 'all').map((category) => ({
        ...category,
        label: t(category.labelKey, category.labelFallback),
      })),
    [t],
  );

  const topicLabel = React.useMemo(
    () =>
      translatedTopics.find((category) => category.id === topic)?.label ??
      t('support.contact.topic.fallback', 'Analysis'),
    [t, topic, translatedTopics],
  );

  const openMailApp = React.useCallback(async () => {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();

    if (!trimmedSubject || !trimmedMessage) {
      Alert.alert(
        t('support.contact.validation.title', 'Missing information'),
        t(
          'support.contact.validation.message',
          'Please enter both a subject and a message before opening your email app.',
        ),
      );
      return;
    }

    const body = [
      trimmedMessage,
      '',
      `${t('support.contact.topicLabel', 'Topic')}: ${topicLabel}`,
      `${t('support.contact.sourceLabel', 'Source')}: ${params.source?.trim() || 'app'}`,
      params.analysisId?.trim() ? `${t('support.contact.analysisIdLabel', 'Analysis ID')}: ${params.analysisId.trim()}` : '',
      params.foodName?.trim() ? `${t('support.contact.foodNameLabel', 'Food name')}: ${params.foodName.trim()}` : '',
      `${t('support.contact.localeLabel', 'Locale')}: ${locale}`,
      `${t('support.contact.platformLabel', 'Platform')}: ${Platform.OS}`,
      `${t('support.contact.appVersionLabel', 'App version')}: ${Constants.expoConfig?.version ?? Constants['nativeApplicationVersion'] ?? 'unknown'}`,
    ]
      .filter((line) => line.trim().length > 0)
      .join('\n');

    const mailtoUrl = buildSupportMailtoUrl(trimmedSubject, body);

    try {
      await openMailtoUrl(mailtoUrl);
    } catch {
      Alert.alert(
        t('support.contact.openFailed.title', 'Unable to open email app'),
        t(
          'support.contact.openFailed.message',
          `Please email ${SUPPORT_EMAIL_ADDRESS} manually with the message below.`,
        ),
      );
    }
  }, [locale, message, params.analysisId, params.foodName, params.source, subject, t, topicLabel]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('support.contact.title', 'Contact Support'),
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 32,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.textPrimary, fontSize: 30, fontWeight: '800' }}>
            {t('support.contact.title', 'Contact Support')}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 22 }}>
            {t(
              'support.contact.subtitle',
              'Send us an email and we will reply as soon as we can.',
            )}
          </Text>
        </View>

        <View
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 18,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>
            {t('support.contact.topicLabel', 'Topic')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {translatedTopics.map((item) => {
              const isActive = item.id === topic;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setTopic(item.id as SupportFaqTopicId)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: isActive ? theme.tint : theme.background,
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
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 18,
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>
            {t('support.contact.subjectLabel', 'Subject')}
          </Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder={t('support.contact.subject.placeholder', 'Tell us what happened')}
            placeholderTextColor={theme.textSecondary}
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: theme.textPrimary,
              fontSize: 15,
            }}
          />

          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 }}>
            {t('support.contact.messageLabel', 'Message')}
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={t(
              'support.contact.message.placeholder',
              'Describe what you saw, what you expected, and any error message.',
            )}
            placeholderTextColor={theme.textSecondary}
            multiline
            textAlignVertical="top"
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: theme.textPrimary,
              fontSize: 15,
              minHeight: 160,
            }}
          />
        </View>

        <View
          style={{
            backgroundColor: colorScheme === 'dark' ? 'rgba(96, 165, 250, 0.12)' : '#EFF6FF',
            borderColor: colorScheme === 'dark' ? 'rgba(96, 165, 250, 0.35)' : '#BFDBFE',
            borderWidth: 1,
            borderRadius: 18,
            padding: 16,
            gap: 8,
          }}
        >
          <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '800' }}>
            {t('support.contact.emailLabel', 'Support Email')}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
            {SUPPORT_EMAIL_ADDRESS}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
            {t(
              'support.contact.prefillHint',
              'We will open your email app with the subject and message prefilled.',
            )}
          </Text>
        </View>

        <Pressable
          onPress={openMailApp}
          style={{
            backgroundColor: theme.tint,
            borderRadius: 16,
            paddingVertical: 15,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: accentTextColor, fontSize: 15, fontWeight: '800' }}>
            {t('support.contact.sendButton', 'Open Mail App')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
