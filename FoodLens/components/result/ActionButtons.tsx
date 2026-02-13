import { View, Text } from 'react-native';
import { ArrowUpCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { HapticTouchableOpacity } from '../HapticFeedback';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { actionButtonsStyles as styles } from './styles/actionButtons.styles';
import { getActionButtonTheme } from './utils/actionButtonTheme';

export function ActionButtons() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const buttonTheme = getActionButtonTheme(colorScheme);
  
  return (
    <View style={styles.bottomFloat}>
        <HapticTouchableOpacity 
            style={[
                styles.saveButton, 
                {
                    backgroundColor: buttonTheme.backgroundColor,
                    shadowColor: theme.shadow
                }
            ]} 
            onPress={() => router.replace('/')} 
            hapticType="success"
        >
            <ArrowUpCircle size={22} color={buttonTheme.foregroundColor} />
            <Text style={[styles.saveButtonText, { color: buttonTheme.foregroundColor }]}>Save to Journal</Text>
        </HapticTouchableOpacity>
    </View>
  );
}
