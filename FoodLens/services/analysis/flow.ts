import * as FileSystem from 'expo-file-system/legacy';
import { AnalysisJobStatus } from '@/services/ai';

import { showAlert } from '@/services/ui/uiAlerts';

type BooleanRefLike = {
  current: boolean;
};

type AnalysisLocationResolverParams<T> = {
  initialLocation: T | null | undefined;
  shouldLoad: (location: T | null | undefined) => boolean;
  loadLocation: () => Promise<T | null | undefined>;
  onLoaded?: (location: T | null | undefined) => void;
  onError?: (error: unknown) => void;
};

type OfflineResetParams = {
  isConnected: boolean;
  title: string;
  message: string;
  resetState: () => void;
  onExit?: () => void;
};

type UploadProgressHandlerParams = {
  isCancelled: BooleanRefLike;
  setUploadProgress: (value: number | undefined) => void;
  setActiveStep: (value: number | undefined) => void;
};

export const assertAnalysisImageFileReady = async (uri: string): Promise<void> => {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  const fileSize = 'size' in fileInfo ? fileInfo.size : undefined;
  if (!fileInfo.exists || fileSize === 0) {
    throw new Error('File validation failed: Image is empty or missing.');
  }
};

export const resolveAnalysisLocation = async <T>({
  initialLocation,
  shouldLoad,
  loadLocation,
  onLoaded,
  onError,
}: AnalysisLocationResolverParams<T>): Promise<T | null | undefined> => {
  let location = initialLocation;
  if (!shouldLoad(location)) {
    return location;
  }

  try {
    location = await loadLocation();
    onLoaded?.(location);
  } catch (error) {
    onError?.(error);
  }

  return location;
};

export const showOfflineAlertAndReset = ({
  isConnected,
  title,
  message,
  resetState,
  onExit,
}: OfflineResetParams): boolean => {
  if (isConnected) {
    return false;
  }

  showAlert(title, message);
  resetState();
  onExit?.();
  return true;
};

export const createAnalysisUploadProgressHandler = ({
  isCancelled,
  setUploadProgress,
  setActiveStep,
}: UploadProgressHandlerParams) => {
  return (progress: number) => {
    if (isCancelled.current) {
      return;
    }

    setUploadProgress(progress);
    if (progress >= 1) {
      setActiveStep(2);
    }
  };
};

const ANALYSIS_JOB_STAGE_TO_STEP: Record<AnalysisJobStatus, number> = {
  queued: 2,
  preprocessing: 3,
  inference: 4,
  nutrition: 5,
  finalizing: 6,
  completed: 6,
  fallback_completed: 6,
  failed: 6,
};

export const applyAnalysisJobStageToHud = ({
  status,
  setActiveStep,
  setUploadProgress,
}: {
  status: AnalysisJobStatus;
  setActiveStep: (value: number | undefined) => void;
  setUploadProgress: (value: number | undefined) => void;
}): void => {
  setUploadProgress(1);
  setActiveStep(ANALYSIS_JOB_STAGE_TO_STEP[status]);
};
