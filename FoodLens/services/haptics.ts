import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Global Haptic Feedback Service
 * Provides consistent 'tick' and vibration patterns across the app.
 */
export const HapticsService = {
  /**
   * Very light impact, feels like a subtle 'tick'.
   * Good for: UI toggles, list item presses, small interactions.
   */
  light: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Medium impact, feels like a solid 'thud'.
   * Good for: Button presses, card expansions, significant state changes.
   */
  medium: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },

  /**
   * Heavy impact, feels like a strong 'bump'.
   * Good for: Critical actions, delete confirmations, long-press actions.
   */
  heavy: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  /**
   * Selection change feedback.
   * Extremely subtle, meant for scrolling pickers or slider changes.
   */
  selection: () => {
    Haptics.selectionAsync();
  },

  /**
   * Success notification (usually two quick vibrations).
   * Good for: Completed tasks, saved success, successful scan.
   */
  success: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  /**
   * Warning notification.
   * Good for: Validation warnings, potential destructive actions.
   */
  warning: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },

  /**
   * Error notification (usually longer or distinct vibration).
   * Good for: Failed actions, network errors, validation errors.
   */
  error: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  /**
   * Custom 'tick-tick' pattern (Sequential taps).
   * Useful for specific custom interactions.
   */
  tickTick: async () => {
    if (Platform.OS === 'ios') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }, 100);
    } else {
      // Android often handles rapid sequential haptics poorly, stick to one selection
      Haptics.selectionAsync();
    }
  }
};
