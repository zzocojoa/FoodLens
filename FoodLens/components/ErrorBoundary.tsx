import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { captureError } from '@/services/sentry';
import { useI18n } from '@/features/i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  messages?: ErrorBoundaryMessages;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

type ErrorBoundaryMessages = {
  title: string;
  message: string;
  retry: string;
};

/**
 * Global Error Boundary
 * Catches unhandled JS errors in the component tree and shows a fallback UI.
 */
const DEFAULT_MESSAGES: ErrorBoundaryMessages = {
  title: 'Oops! Something went wrong.',
  message: 'We encountered an unexpected error. Usually this is temporary.',
  retry: 'Try Again',
};

export class ErrorBoundaryBase extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    captureError(error, {
      componentStack: errorInfo.componentStack ?? 'unknown',
    });
  }

  handleRetry = () => {
    // Attempt to recover by resetting state
    // In a real app, might want to reload the bundle or clear specific cache
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { fallback, children, messages = DEFAULT_MESSAGES } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <AlertTriangle size={48} color="#EF4444" />
            </View>
            <Text style={styles.title}>{messages.title}</Text>
            <Text style={styles.message}>
              {messages.message}
            </Text>
            
            {error && (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText} numberOfLines={3}>
                        {error.toString()}
                    </Text>
                </View>
            )}

            <TouchableOpacity 
              style={styles.retryButton}
              onPress={this.handleRetry}
              activeOpacity={0.8}
            >
              <RefreshCw size={20} color="white" style={{marginRight: 8}} />
              <Text style={styles.retryText}>{messages.retry}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return children;
  }
}

export function ErrorBoundary({ children, fallback }: Omit<Props, 'messages'>) {
  const { t } = useI18n();

  return (
    <ErrorBoundaryBase
      fallback={fallback}
      messages={{
        title: t('errorBoundary.title', DEFAULT_MESSAGES.title),
        message: t('errorBoundary.message', DEFAULT_MESSAGES.message),
        retry: t('errorBoundary.retry', DEFAULT_MESSAGES.retry),
      }}
    >
      {children}
    </ErrorBoundaryBase>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    maxWidth: 400,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  errorBox: {
      backgroundColor: '#E2E8F0',
      padding: 12,
      borderRadius: 8,
      marginBottom: 32,
      width: '100%'
  },
  errorText: {
      color: '#475569',
      fontSize: 12,
      fontFamily: 'Courier',
  },
  retryButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
