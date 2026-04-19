import { MutableRefObject, useCallback } from 'react';
import {
  getAnalysisErrorText,
  isFileError,
  isRetryableServerError,
  isTimeoutStyleAnalysisError,
} from '../utils/cameraMappers';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { clearPendingAnalysisJob } from '@/services/aiCore/pendingAnalysisStore';
import { logger } from '@/services/logger';

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
  const clearPendingAnalysisJobSafely = useCallback(() => {
    void clearPendingAnalysisJob().catch((error) => {
      logger.warn('Failed to clear pending camera analysis job', error, 'CameraGateway');
    });
  }, []);

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

      if (isTimeoutStyleAnalysisError(errorMessage)) {
        showTranslatedAlert(t, {
          titleKey: 'camera.alert.analysisFailedTitle',
          titleFallback: 'Analysis Failed',
          messageKey: 'scan.alert.analysisTimeout',
          messageFallback: 'Analysis is taking longer than expected. Please try again.',
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
      clearPendingAnalysisJobSafely();
      resetState();
      const errorMessage = getAnalysisErrorText(error);

      if (isRetryableServerError(errorMessage)) {
        showRetryableServerAlert(uri);
        return;
      }

      showAnalysisFailureAlert(errorMessage);
      onExit();
    },
    [clearPendingAnalysisJobSafely, onExit, resetState, showAnalysisFailureAlert, showRetryableServerAlert]
  );
};
