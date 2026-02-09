
import { Stack } from 'expo-router';

export default function ScanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
    </Stack>
  );
}
