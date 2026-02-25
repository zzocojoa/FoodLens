import React from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GENDER_OPTIONS } from '@/features/profile/constants/profile.constants';
import { MAX_BIRTH_DATE, MIN_BIRTH_DATE } from '../../constants/onboarding.constants';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';
import type { BirthDateSelectHandler, Translate } from '../../types/onboarding.types';
import type { Gender } from '@/features/profile/types/profile.types';

const pad2 = (value: number): string => value.toString().padStart(2, '0');
const WHEEL_ITEM_HEIGHT = 44;

const getDaysInMonth = (year: number, monthIndex: number): number => {
  return new Date(year, monthIndex + 1, 0).getDate();
};

const clampBirthDate = (candidate: Date): Date => {
  const candidateTime = candidate.getTime();
  const minTime = MIN_BIRTH_DATE.getTime();
  const maxTime = MAX_BIRTH_DATE.getTime();

  if (candidateTime < minTime) {
    return new Date(MIN_BIRTH_DATE);
  }
  if (candidateTime > maxTime) {
    return new Date(MAX_BIRTH_DATE);
  }

  return candidate;
};

type Props = {
  theme: any;
  t: Translate;
  gender: Gender | null;
  birthDate: Date;
  onSelectGender: (gender: Gender) => void;
  onSelectBirthDate: BirthDateSelectHandler;
  onNext: () => void;
  onSkip: () => void;
};

type BirthWheelColumnProps = {
  label: string;
  values: number[];
  selectedValue: number;
  displayValue: (value: number) => string;
  onSelectValue: (value: number) => void;
  scrollRef: React.RefObject<ScrollView | null>;
  textPrimaryColor: string;
  textSecondaryColor: string;
  borderColor: string;
};

const BirthWheelColumn = ({
  label,
  values,
  selectedValue,
  displayValue,
  onSelectValue,
  scrollRef,
  textPrimaryColor,
  textSecondaryColor,
  borderColor,
}: BirthWheelColumnProps) => {
  const selectedIndex = Math.max(0, values.indexOf(selectedValue));

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(values.length - 1, index));
    const value = values[clampedIndex];
    if (value !== selectedValue) {
      onSelectValue(value);
    }
  };

  const handlePressValue = (value: number) => {
    const index = values.indexOf(value);
    if (index >= 0) {
      scrollRef.current?.scrollTo({
        y: index * WHEEL_ITEM_HEIGHT,
        animated: true,
      });
    }
    onSelectValue(value);
  };

  return (
    <View style={styles.birthWheelColumn}>
      <Text style={[styles.birthWheelLabel, { color: textSecondaryColor }]}>{label}</Text>
      <View style={[styles.birthWheelViewport, { borderColor }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.birthWheelScroll}
          contentContainerStyle={styles.birthWheelContent}
          showsVerticalScrollIndicator={false}
          snapToInterval={WHEEL_ITEM_HEIGHT}
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={16}
          nestedScrollEnabled
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          keyboardShouldPersistTaps="always"
        >
          {values.map((value) => {
            const selected = value === selectedValue;
            return (
              <TouchableOpacity
                key={value}
                style={styles.birthWheelItem}
                activeOpacity={0.75}
                onPress={() => handlePressValue(value)}
              >
                <Text
                  style={[
                    styles.birthWheelItemText,
                    { color: textPrimaryColor },
                    selected ? styles.birthWheelItemTextSelected : null,
                  ]}
                >
                  {displayValue(value)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View pointerEvents="none" style={styles.birthWheelSelectedOverlay} />
      </View>
      <Text style={[styles.birthWheelValuePreview, { color: textSecondaryColor }]}>
        {displayValue(values[selectedIndex] ?? selectedValue)}
      </Text>
    </View>
  );
};

export default function ProfileStep({
  theme,
  t,
  gender,
  birthDate,
  onSelectGender,
  onSelectBirthDate,
  onNext,
  onSkip,
}: Props) {
  const insets = useSafeAreaInsets();
  const [showBirthDateSheet, setShowBirthDateSheet] = React.useState(false);
  const yearScrollRef = React.useRef<ScrollView | null>(null);
  const monthScrollRef = React.useRef<ScrollView | null>(null);
  const dayScrollRef = React.useRef<ScrollView | null>(null);
  const wheelInitializedRef = React.useRef(false);

  const now = new Date();
  const birthMonth = birthDate.getMonth();
  const birthDay = birthDate.getDate();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthMonth || (now.getMonth() === birthMonth && now.getDate() >= birthDay);
  const age = now.getFullYear() - birthDate.getFullYear() - (hasHadBirthdayThisYear ? 0 : 1);
  const birthDateText = `${birthDate.getFullYear()}.${pad2(birthDate.getMonth() + 1)}.${pad2(
    birthDate.getDate()
  )}`;
  const selectedYear = birthDate.getFullYear();
  const selectedMonth = birthDate.getMonth() + 1;
  const selectedDay = birthDate.getDate();

  const birthYears = React.useMemo(() => {
    const minYear = MIN_BIRTH_DATE.getFullYear();
    const maxYear = MAX_BIRTH_DATE.getFullYear();
    const years: number[] = [];
    for (let year = maxYear; year >= minYear; year -= 1) {
      years.push(year);
    }
    return years;
  }, []);
  const birthMonths = React.useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const birthDays = React.useMemo(() => {
    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth - 1);
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [selectedMonth, selectedYear]);

  const updateBirthDate = React.useCallback(
    (updater: (current: Date) => Date) => {
      const nextDate = updater(new Date(birthDate));
      onSelectBirthDate(clampBirthDate(nextDate));
    },
    [birthDate, onSelectBirthDate]
  );

  const handleSelectBirthYear = React.useCallback(
    (year: number) => {
      updateBirthDate((current) => {
        const targetDay = current.getDate();
        current.setDate(1);
        current.setFullYear(year);
        const maxDay = getDaysInMonth(current.getFullYear(), current.getMonth());
        current.setDate(Math.min(targetDay, maxDay));
        return current;
      });
    },
    [updateBirthDate]
  );

  const handleSelectBirthMonth = React.useCallback(
    (month: number) => {
      updateBirthDate((current) => {
        const targetDay = current.getDate();
        current.setDate(1);
        current.setMonth(month - 1);
        const maxDay = getDaysInMonth(current.getFullYear(), current.getMonth());
        current.setDate(Math.min(targetDay, maxDay));
        return current;
      });
    },
    [updateBirthDate]
  );

  const handleSelectBirthDay = React.useCallback(
    (day: number) => {
      updateBirthDate((current) => {
        current.setDate(day);
        return current;
      });
    },
    [updateBirthDate]
  );

  const scrollToWheelIndex = React.useCallback((ref: React.RefObject<ScrollView | null>, index: number) => {
    ref.current?.scrollTo({
      y: Math.max(0, index) * WHEEL_ITEM_HEIGHT,
      animated: false,
    });
  }, []);

  React.useEffect(() => {
    if (!showBirthDateSheet) {
      wheelInitializedRef.current = false;
      return;
    }

    if (wheelInitializedRef.current) {
      return;
    }

    wheelInitializedRef.current = true;
    requestAnimationFrame(() => {
      scrollToWheelIndex(yearScrollRef, birthYears.indexOf(selectedYear));
      scrollToWheelIndex(monthScrollRef, selectedMonth - 1);
      scrollToWheelIndex(dayScrollRef, selectedDay - 1);
    });
  }, [
    birthYears,
    scrollToWheelIndex,
    selectedDay,
    selectedMonth,
    selectedYear,
    showBirthDateSheet,
  ]);

  React.useEffect(() => {
    if (!showBirthDateSheet || !wheelInitializedRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      scrollToWheelIndex(dayScrollRef, selectedDay - 1);
    });
  }, [birthDays.length, scrollToWheelIndex, selectedDay, showBirthDateSheet]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        styles.stepScrollContent,
        { paddingBottom: Math.max(36, insets.bottom + 24) },
      ]}
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
        {t('onboarding.profile.birthDateTitle', 'Birth Date')}
      </Text>
      <TouchableOpacity
        style={[styles.pickerWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}
        activeOpacity={0.75}
        onPress={() => setShowBirthDateSheet(true)}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.profile.birthDateTitle', 'Birth Date')}
        accessibilityHint={t('onboarding.accessibility.birthDateHint', 'Open the birth date picker')}
      >
        <Text style={[styles.pickerAge, { color: theme.textPrimary, marginTop: 0 }]}>
          {birthDateText}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary, fontSize: 13, paddingHorizontal: 0 }]}>
          {t('onboarding.profile.tapToChooseDate', 'Tap to choose birth date')}
        </Text>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent
        visible={showBirthDateSheet}
        onRequestClose={() => setShowBirthDateSheet(false)}
      >
        <View style={styles.yearPickerBackdrop}>
          <View style={[styles.yearPickerSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.yearPickerTitle, { color: theme.textPrimary }]}>
              {t('onboarding.profile.birthDateTitle', 'Birth Date')}
            </Text>
            <View style={styles.birthWheelRow}>
              <BirthWheelColumn
                label={t('onboarding.profile.birthYearLabel', 'Year')}
                values={birthYears}
                selectedValue={selectedYear}
                displayValue={(value) => value.toString()}
                onSelectValue={handleSelectBirthYear}
                scrollRef={yearScrollRef}
                textPrimaryColor={theme.textPrimary}
                textSecondaryColor={theme.textSecondary}
                borderColor={theme.border}
              />
              <BirthWheelColumn
                label={t('onboarding.profile.birthMonthLabel', 'Month')}
                values={birthMonths}
                selectedValue={selectedMonth}
                displayValue={(value) => pad2(value)}
                onSelectValue={handleSelectBirthMonth}
                scrollRef={monthScrollRef}
                textPrimaryColor={theme.textPrimary}
                textSecondaryColor={theme.textSecondary}
                borderColor={theme.border}
              />
              <BirthWheelColumn
                label={t('onboarding.profile.birthDayLabel', 'Day')}
                values={birthDays}
                selectedValue={selectedDay}
                displayValue={(value) => pad2(value)}
                onSelectValue={handleSelectBirthDay}
                scrollRef={dayScrollRef}
                textPrimaryColor={theme.textPrimary}
                textSecondaryColor={theme.textSecondary}
                borderColor={theme.border}
              />
            </View>

            <TouchableOpacity
              style={[styles.yearPickerCloseButton, { backgroundColor: theme.primary }]}
              activeOpacity={0.85}
              onPress={() => setShowBirthDateSheet(false)}
            >
              <Text style={styles.yearPickerCloseButtonText}>{t('common.done', 'Done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
