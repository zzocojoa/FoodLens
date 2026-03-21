import { act, renderHook } from '@testing-library/react-native';
import type { PermissionResponse } from 'expo-camera';
import type { CameraView } from 'expo-camera';
import { PermissionStatus } from 'expo-modules-core';
import { showOpenSettingsAlert } from '@/services/ui/permissionDialogs';
import { dispatchPhase2SyncQueue, enqueuePhase2Sync } from '@/services/sync/phase2SyncQueue';
import { updateUserClientState } from '@/services/user/clientStateService';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { useScanCaptureFlow } from '../useScanCaptureFlow';
import { useScanPermissionFlow } from '../useScanPermissionFlow';

jest.mock('@/services/ui/permissionDialogs', () => ({
  showOpenSettingsAlert: jest.fn(),
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Medium: 'medium',
  },
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  enqueuePhase2Sync: jest.fn(),
  dispatchPhase2SyncQueue: jest.fn(),
}));

jest.mock('@/services/user/clientStateService', () => ({
  updateUserClientState: jest.fn(),
}));

const mockedShowOpenSettingsAlert =
  showOpenSettingsAlert as jest.MockedFunction<typeof showOpenSettingsAlert>;
const mockedShowTranslatedAlert =
  showTranslatedAlert as jest.MockedFunction<typeof showTranslatedAlert>;
const mockedEnqueuePhase2Sync = enqueuePhase2Sync as jest.MockedFunction<typeof enqueuePhase2Sync>;
const mockedDispatchPhase2SyncQueue =
  dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedUpdateUserClientState =
  updateUserClientState as jest.MockedFunction<typeof updateUserClientState>;

const translate = (key: string, fallback?: string): string => fallback || key;

describe('scan local-only flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps denied permission handling in local alert state only', async () => {
    const permission: PermissionResponse = {
      granted: false,
      canAskAgain: false,
      expires: 'never',
      status: PermissionStatus.DENIED,
    };
    const requestPermission = jest.fn<Promise<PermissionResponse>, []>().mockResolvedValue(permission);
    const { result } = renderHook(() =>
      useScanPermissionFlow({
        requestPermission,
        t: translate,
      })
    );

    await act(async () => {
      await result.current();
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(mockedShowOpenSettingsAlert).toHaveBeenCalledTimes(1);
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
    expect(mockedDispatchPhase2SyncQueue).not.toHaveBeenCalled();
    expect(mockedUpdateUserClientState).not.toHaveBeenCalled();
  });

  it('keeps barcode capture guidance in local runtime state only', async () => {
    const takePictureAsync = jest.fn().mockResolvedValue({
      uri: 'file://barcode.jpg',
      width: 1200,
      height: 800,
      exif: {},
    });
    const cameraRef = {
      current: {
        takePictureAsync,
      } as Pick<CameraView, 'takePictureAsync'> as CameraView,
    };
    const processImage = jest.fn<Promise<void>, [string, 'camera' | 'library', string | null | undefined]>();
    const processLabel = jest.fn<Promise<void>, [string, string | null | undefined]>();
    const { result } = renderHook(() =>
      useScanCaptureFlow({
        cameraRef,
        mode: 'BARCODE',
        processImage,
        processLabel,
        t: translate,
      })
    );

    await act(async () => {
      await result.current();
    });

    expect(takePictureAsync).toHaveBeenCalledTimes(1);
    expect(mockedShowTranslatedAlert).toHaveBeenCalledTimes(1);
    expect(processImage).not.toHaveBeenCalled();
    expect(processLabel).not.toHaveBeenCalled();
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
    expect(mockedDispatchPhase2SyncQueue).not.toHaveBeenCalled();
    expect(mockedUpdateUserClientState).not.toHaveBeenCalled();
  });
});
