import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GENDER_OPTIONS } from '@/features/profile/constants/profile.constants';
import { MAX_BIRTH_DATE, MIN_BIRTH_DATE } from '../../constants/onboarding.constants';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';
import type { BirthDateChangeHandler, Translate } from '../../types/onboarding.types';
import type { Gender } from '@/features/profile/types/profile.types';

type Props = {
  theme: any;
  colorScheme: 'light' | 'dark';
  locale: string;
  t: Translate;
  gender: Gender | null;
  birthDate: Date;
  onSelectGender: (gender: Gender) => void;
  onBirthDateChange: BirthDateChangeHandler;
  onNext: () => void;
  onSkip: () => void;
};

export default function ProfileStep({
  theme,
  colorScheme,
  locale,
  t,
  gender,
  birthDate,
  onSelectGender,
  onBirthDateChange,
  onNext,
  onSkip,
}: Props) {
  const now = new Date();
  const birthMonth = birthDate.getMonth();
  const birthDay = birthDate.getDate();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthMonth || (now.getMonth() === birthMonth && now.getDate() >= birthDay);
  const age = now.getFullYear() - birthDate.getFullYear() - (hasHadBirthdayThisYear ? 0 : 1);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.stepScrollContent, { paddingBottom: 60 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroAreaScroll}>
        <Text style={styles.welcomeEmoji}>👤</Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('onboarding.profile.title', 'About You')}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t('onboarding.profile.subtitle', 'Help us personalize your experience with basic info.')}
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
        {t('onboarding.profile.genderTitle', 'Gender')}
      </Text>
      <View style={styles.genderGrid}>
        {GENDER_OPTIONS.map((opt) => {
          const isSelected = gender === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.genderCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
                isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => onSelectGender(opt.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t(`onboarding.profile.gender.${opt.key}`, opt.label)}
              accessibilityHint={t('onboarding.accessibility.genderHint', 'Select your gender')}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={styles.genderIcon}>{opt.icon}</Text>
              <Text
                style={[
                  styles.genderLabel,
                  { color: theme.textPrimary },
                  isSelected && { color: 'white' },
                ]}
              >
                {t(`onboarding.profile.gender.${opt.key}`, opt.label)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 28 }]}>
        {t('onboarding.profile.birthYearTitle', 'Birth Year')}
      </Text>
      <View style={[styles.pickerWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <DateTimePicker
          value={birthDate}
          mode="date"
          display="spinner"
          onChange={onBirthDateChange}
          minimumDate={MIN_BIRTH_DATE}
          maximumDate={MAX_BIRTH_DATE}
          textColor={theme.textPrimary}
          locale={locale}
          themeVariant={colorScheme}
          style={{ height: 150, width: '100%' }}
        />
      </View>
      <Text style={[styles.pickerAge, { color: theme.textSecondary }]}>
        {age}
        {t('onboarding.profile.yearsOld', ' yrs old')}
      </Text>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: theme.primary, marginTop: 32 }]}
        onPress={onNext}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.profile.next', 'Continue')}
        accessibilityHint={t('onboarding.accessibility.profileContinueHint', 'Save this step and continue')}
      >
        <Text style={styles.primaryButtonText}>{t('onboarding.profile.next', 'Continue')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSkip}
        style={styles.skipButton}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.skip', 'Skip for now')}
        accessibilityHint={t('onboarding.accessibility.skipHint', 'Skip this step and continue')}
      >
        <Text style={[styles.skipText, { color: theme.textSecondary }]}>
          {t('onboarding.skip', 'Skip for now')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
