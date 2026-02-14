import { Alert, Linking } from 'react-native';

type OpenSettingsAlertParams = {
  title: string;
  message: string;
  cancelLabel: string;
  settingsLabel: string;
};

export const openAppSettings = () => {
  void Linking.openSettings();
};

export const showOpenSettingsAlert = ({
  title,
  message,
  cancelLabel,
  settingsLabel,
}: OpenSettingsAlertParams) => {
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    {
      text: settingsLabel,
      onPress: openAppSettings,
    },
  ]);
};
