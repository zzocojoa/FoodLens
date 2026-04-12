import { View, Text } from 'react-native';
import { ArrowUpCircle } from 'lucide-react-native';
import { HapticTouchableOpacity } from '../HapticFeedback';
import { actionButtonsStyles as styles } from './styles/actionButtons.styles';
import { useActionButtonsModel } from './hooks/useActionButtonsModel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ActionButtonsProps = {
  t: (key: string, fallback?: string) => string;
};

export function ActionButtons({ t }: ActionButtonsProps) {
  const insets = useSafeAreaInsets();
  const { buttonTheme, onGoHome } = useActionButtonsModel();
  
  return (
    <View style={[styles.bottomFloat, { bottom: Math.max(30, insets.bottom + 16) }]}>
        <Text style={styles.helperText}>
          {t('result.action.footerLabel', 'Optional actions')}
        </Text>
        <HapticTouchableOpacity 
            style={[
                styles.saveButton, 
                {
                    backgroundColor: buttonTheme.backgroundColor,
                }
            ]} 
            onPress={onGoHome}
            hapticType="light"
        >
            <ArrowUpCircle size={18} color={buttonTheme.foregroundColor} />
            <Text style={[styles.saveButtonText, { color: buttonTheme.foregroundColor }]}>
              {t('result.action.backHome', 'Back to Home')}
            </Text>
        </HapticTouchableOpacity>
    </View>
  );
}
