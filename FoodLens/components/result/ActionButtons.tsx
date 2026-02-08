import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowUpCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { HapticTouchableOpacity } from '../HapticFeedback';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';

export function ActionButtons() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  
  return (
    <View style={styles.bottomFloat}>
        <HapticTouchableOpacity 
            style={[
                styles.saveButton, 
                {
                    backgroundColor: colorScheme === 'dark' ? 'white' : '#0F172A',
                    shadowColor: theme.shadow
                }
            ]} 
            onPress={() => router.replace('/')} 
            hapticType="success"
        >
            <ArrowUpCircle size={22} color={colorScheme === 'dark' ? 'black' : 'white'} />
            <Text style={[styles.saveButtonText, {color: colorScheme === 'dark' ? 'black' : 'white'}]}>Save to Journal</Text>
        </HapticTouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomFloat: {
    position: 'absolute',
    bottom: 30,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 50,
  },
  saveButton: {
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 100,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 10,
    width: '100%',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
