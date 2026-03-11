import { MutableRefObject, useCallback } from 'react';
import { isFileError, isRetryableServerError } from '../utils/cameraMappers';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';

type Translate = (key: string, fallback?: string) => string;

type UseCameraGatewayErrorHandlerParams = {
  t: Translate;
  messages: { file: string; analysis: string };
  onExit: () => void;
  resetState: () => void;
  processImageRef: MutableRefObject<(uri: string) => Promise<void>>;
};

export const useCameraGatewayErrorHandler = ({
  t,
  messages,
  onExit,
  resetState,
  processImageRef,
}: UseCameraGatewayErrorHandlerParams) => {
  const showRetryableServerAlert = useCallback(
    (uri: string) => {
      showTranslatedAlert(t, {
        titleKey: 'camera.alert.serverErrorTitle',
        titleFallback: 'Server Error',
        messageKey: 'camera.alert.serverRetryMessage',
        messageFallback: 'A temporary server issue occurred.\nWould you like to try again?',
        buttons: [
          { textKey: 'common.cancel', textFallback: 'Cancel', style: 'cancel', onPress: () => onExit() },
          {
            textKey: 'common.retry',
            textFallback: 'Retry',
            onPress: () => {
              if (uri) {
                processImageRef.current(uri);
              }
            },
          },
        ],
      });
    },
    [onExit, processImageRef, t]
  );

  const showAnalysisFailureAlert = useCallback(
    (errorMessage: string) => {
      if (isFileError(errorMessage)) {
        showTranslatedAlert(t, {
          titleKey: 'camera.alert.fileErrorTitle',
          titleFallback: 'File Error',
          messageKey: 'camera.error.file',
          messageFallback: messages.file,
        });
        return;
      }

      showTranslatedAlert(t, {
        titleKey: 'camera.alert.analysisFailedTitle',
        titleFallback: 'Analysis Failed',
        messageKey: 'camera.error.analysis',
        messageFallback: messages.analysis,
      });
    },
    [messages.analysis, messages.file, t]
  );

  return useCallback(
    (error: unknown, uri: string) => {
      resetState();
      const errorMessage =
        error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();

      if (isRetryableServerError(errorMessage)) {
        showRetryableServerAlert(uri);
        return;
      }

      showAnalysisFailureAlert(errorMessage);
      onExit();
    },
    [onExit, resetState, showAnalysisFailureAlert, showRetryableServerAlert]
  );
};
