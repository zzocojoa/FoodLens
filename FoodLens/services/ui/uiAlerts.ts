import { Alert, AlertButton, AlertOptions } from 'react-native';

type Translate = (key: string, fallback?: string) => string;

type TranslatedButton = {
  textKey: string;
  textFallback: string;
  style?: AlertButton['style'];
  onPress?: () => void;
};

type TranslatedAlertParams = {
  titleKey: string;
  titleFallback: string;
  messageKey: string;
  messageFallback: string;
  buttons?: TranslatedButton[];
};

const toAlertButtons = (
  t: Translate,
  buttons?: TranslatedButton[]
): AlertButton[] | undefined =>
  buttons?.map((button) => ({
    text: t(button.textKey, button.textFallback),
    style: button.style,
    onPress: button.onPress,
  }));

export const showTranslatedAlert = (t: Translate, params: TranslatedAlertParams) => {
  const buttons = toAlertButtons(t, params.buttons);
  Alert.alert(
    t(params.titleKey, params.titleFallback),
    t(params.messageKey, params.messageFallback),
    buttons
  );
};

export const showAlert = (
  title: string,
  message: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) => {
  Alert.alert(title, message, buttons, options);
};
