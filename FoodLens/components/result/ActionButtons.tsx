import { View, Text } from 'react-native';
import { ArrowUpCircle } from 'lucide-react-native';
import { HapticTouchableOpacity } from '../HapticFeedback';
import { actionButtonsStyles as styles } from './styles/actionButtons.styles';
import { useActionButtonsModel } from './hooks/useActionButtonsModel';

export function ActionButtons() {
  const { buttonTheme, shadowColor, onSaveToJournal } = useActionButtonsModel();
  
  return (
    <View style={styles.bottomFloat}>
        <HapticTouchableOpacity 
            style={[
                styles.saveButton, 
                {
                    backgroundColor: buttonTheme.backgroundColor,
                    shadowColor
                }
            ]} 
            onPress={onSaveToJournal}
            hapticType="success"
        >
            <ArrowUpCircle size={22} color={buttonTheme.foregroundColor} />
            <Text style={[styles.saveButtonText, { color: buttonTheme.foregroundColor }]}>Save to Journal</Text>
        </HapticTouchableOpacity>
    </View>
  );
}
