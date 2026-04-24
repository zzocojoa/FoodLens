import { Tabs } from 'expo-router';
import React from 'react';

import { useI18n } from '@/features/i18n';

export default function TabLayout() {
  const { t } = useI18n();

  return (
    <Tabs
      backBehavior="none"
      screenOptions={{
        freezeOnBlur: true,
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home', 'Home'),
        }}
      />
      <Tabs.Screen
        name="allergies"
        options={{
          title: t('tabs.allergies', 'Allergies'),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('tabs.history', 'History'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile', 'Profile'),
        }}
      />
    </Tabs>
  );
}
