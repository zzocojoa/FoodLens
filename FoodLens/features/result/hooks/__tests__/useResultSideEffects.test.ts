import { renderHook, waitFor } from '@testing-library/react-native';
import { showOpenSettingsAlert } from '@/services/ui/permissionDialogs';
import { dispatchPhase2SyncQueue, enqueuePhase2Sync } from '@/services/sync/phase2SyncQueue';
import { updateUserClientState } from '@/services/user/clientStateService';
import { photoLibraryService } from '../../services/photoLibraryService';
import { usePhotoLibraryAutoSave } from '../useResultSideEffects';

jest.mock('@/services/analysisService', () => ({
  AnalysisService: {
    updateAnalysisTimestamp: jest.fn(),
  },
}));

jest.mock('@/services/haptics', () => ({
  HapticsService: {
    success: jest.fn(),
  },
}));

jest.mock('../../constants/result.constants', () => ({
  getResultUserId: jest.fn(() => 'usr_result'),
}));

jest.mock('../../services/photoLibraryService', () => ({
  photoLibraryService: {
    saveImageToLibrary: jest.fn(),
  },
}));

jest.mock('@/services/ui/permissionDialogs', () => ({
  showOpenSettingsAlert: jest.fn(),
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  enqueuePhase2Sync: jest.fn(),
  dispatchPhase2SyncQueue: jest.fn(),
}));

jest.mock('@/services/user/clientStateService', () => ({
  updateUserClientState: jest.fn(),
}));

const mockedPhotoLibraryService =
  photoLibraryService as jest.Mocked<typeof photoLibraryService>;
const mockedShowOpenSettingsAlert =
  showOpenSettingsAlert as jest.MockedFunction<typeof showOpenSettingsAlert>;
const mockedEnqueuePhase2Sync = enqueuePhase2Sync as jest.MockedFunction<typeof enqueuePhase2Sync>;
const mockedDispatchPhase2SyncQueue =
  dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedUpdateUserClientState =
  updateUserClientState as jest.MockedFunction<typeof updateUserClientState>;

const translate = (key: string, fallback?: string): string => fallback || key;

describe('usePhotoLibraryAutoSave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPhotoLibraryService.saveImageToLibrary.mockResolvedValue({ status: 'denied' });
  });

  it('keeps photo-library save flow in local device state only', async () => {
    renderHook(() =>
      usePhotoLibraryAutoSave({
        isNew: true,
        sourceType: 'camera',
        imageUri: 'file://result.jpg',
        isBarcode: false,
        locationData: {
          latitude: 37.5665,
          longitude: 126.978,
        },
        t: translate,
      })
    );

    await waitFor(() => {
      expect(mockedPhotoLibraryService.saveImageToLibrary).toHaveBeenCalledWith(
        'file://result.jpg',
        {
          latitude: 37.5665,
          longitude: 126.978,
        }
      );
    });

    expect(mockedShowOpenSettingsAlert).toHaveBeenCalledTimes(1);
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
    expect(mockedDispatchPhase2SyncQueue).not.toHaveBeenCalled();
    expect(mockedUpdateUserClientState).not.toHaveBeenCalled();
  });
});
