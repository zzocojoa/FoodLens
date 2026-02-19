import { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AuthApi, AuthApiError, AuthSessionTokens } from '@/services/auth/authApi';
import { AuthOAuthProvider, OAuthProvider } from '@/services/auth/oauthProvider';
import { persistSession } from '@/services/auth/sessionManager';
import { hasSeenOnboarding } from '@/services/storage';

type LoginMode = 'login' | 'signup';

const resolveErrorMessage = (error: unknown): string => {
  if (error instanceof AuthApiError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Authentication failed. Please try again.';
};

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const oauthMode = AuthOAuthProvider.getOAuthMode();

  const submitLabel = useMemo(() => (mode === 'login' ? 'Login' : 'Create account'), [mode]);

  const completeSignIn = async (session: AuthSessionTokens): Promise<void> => {
    await persistSession(session);
    const seenOnboarding = await hasSeenOnboarding(session.user.id);
    router.replace(seenOnboarding ? '/(tabs)' : '/onboarding');
  };

  const handleSubmit = async (): Promise<void> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.trim().length < 8) {
      setErrorMessage('Enter a valid email and a password with at least 8 characters.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const session =
        mode === 'login'
          ? await AuthApi.loginWithEmail({ email: normalizedEmail, password })
          : await AuthApi.signupWithEmail({ email: normalizedEmail, password, locale: 'ko-KR' });

      await completeSignIn(session);
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: OAuthProvider): Promise<void> => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const session = await AuthOAuthProvider.loginWithOAuthProvider(provider);
      await completeSignIn(session);
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={styles.flex}>
        <View style={styles.container}>
          <Text style={styles.title}>FoodLens Sign In</Text>
          <Text style={styles.subtitle}>Session restoration and data ownership are now account-based.</Text>

          <View style={styles.segmentedControl}>
            <Pressable
              onPress={() => setMode('login')}
              style={[styles.segmentButton, mode === 'login' && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentLabel, mode === 'login' && styles.segmentLabelActive]}>Login</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('signup')}
              style={[styles.segmentButton, mode === 'signup' && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentLabel, mode === 'signup' && styles.segmentLabelActive]}>Sign up</Text>
            </Pressable>
          </View>

          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <Pressable disabled={loading} onPress={() => void handleSubmit()} style={styles.submitButton}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitLabel}>{submitLabel}</Text>}
          </Pressable>

          <View style={styles.oauthSection}>
            <Pressable disabled={loading} onPress={() => void handleOAuthLogin('google')} style={styles.oauthButton}>
              <Text style={styles.oauthLabel}>Continue with Google</Text>
            </Pressable>
            <Pressable disabled={loading} onPress={() => void handleOAuthLogin('kakao')} style={styles.oauthButton}>
              <Text style={styles.oauthLabel}>Continue with Kakao</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>
            OAuth mode: {oauthMode.toUpperCase()}
            {oauthMode === 'mock' ? ' (mock-first validation enabled).' : ' (live callback enabled).'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    marginBottom: 10,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    padding: 4,
    marginBottom: 8,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#0ea5e9',
  },
  segmentLabel: {
    color: '#334155',
    fontWeight: '600',
  },
  segmentLabelActive: {
    color: '#ffffff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#0f766e',
  },
  submitLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  oauthSection: {
    marginTop: 8,
    gap: 8,
  },
  oauthButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  oauthLabel: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 14,
  },
  hint: {
    marginTop: 6,
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
});
