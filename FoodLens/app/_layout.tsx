import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ErrorBoundary } from '../components/ErrorBoundary';

const DEVICE_ID_KEY = '@foodlens_device_id';

// Generate or retrieve a persistent device ID
const initializeDeviceId = async () => {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = 'device_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      console.log(`[AUTH] Created new device ID: ${deviceId}`);
    } else {
      console.log(`[AUTH] Using existing device ID: ${deviceId}`);
    }
    return deviceId;
  } catch (error) {
    console.error('[AUTH] Failed to initialize device ID:', error);
    return 'fallback_device_id';
  }
};

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    initializeDeviceId();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="profile" options={{ headerShown: false }} />
            <Stack.Screen name="history" options={{ headerShown: false }} />
            <Stack.Screen name="trip-stats" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
