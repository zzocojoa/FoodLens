import { performMultipartAnalysisUpload } from '../internal/analyzeUpload';

jest.mock('../upload', () => ({
  uploadWithRetry: jest.fn(),
}));

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserId: jest.fn(() => 'user-1'),
}));

jest.mock('../serverConfig', () => ({
  ServerConfig: {
    getServerUrl: jest.fn(async () => 'https://api.example.com'),
  },
}));

jest.mock('../allergy', () => ({
  getAllergyString: jest.fn(async () => 'peanut'),
}));

jest.mock('../internal/requestLocale', () => ({
  resolveRequestLocale: jest.fn(async () => 'ko-KR'),
}));

jest.mock('../cache', () => ({
  buildImageCacheKey: jest.fn(() => 'cache-key'),
  buildImageContentHash: jest.fn(async () => 'image-hash'),
  getAiCacheValue: jest.fn(async () => null),
  setAiCacheValue: jest.fn(async () => undefined),
}));

jest.mock('../internal/imageCompress', () => ({
  compressForUpload: jest.fn(async (value: string) => value),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  FileSystemUploadType: { MULTIPART: 0 },
}));

const uploadModule = jest.requireMock('../upload') as {
  uploadWithRetry: jest.Mock;
};

describe('performMultipartAnalysisUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uploadModule.uploadWithRetry.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        foodName: 'Soup',
        safetyStatus: 'SAFE',
        ingredients: [],
      }),
    });
  });

  it.each([
    '/analyze',
    '/analyze/label',
    '/analyze/smart',
  ] as const)('uses 15s timeout and max 3 retries for %s', async (endpointPath) => {
    await performMultipartAnalysisUpload({
      endpointPath,
      imageUri: 'file://food.jpg',
      isoCountryCode: 'KR',
      onProgress: undefined,
    });

    expect(uploadModule.uploadWithRetry).toHaveBeenCalledWith(
      `https://api.example.com${endpointPath}`,
      'file://food.jpg',
      expect.any(Object),
      3,
      15000,
      undefined,
    );
  });
});
