import * as FileSystem from 'expo-file-system/legacy';
import { ANALYSIS_TIMEOUT_MS } from '../constants';
import { getAllergyString } from '../allergy';
import { uploadWithRetry } from '../upload';
import { ServerConfig } from '../serverConfig';

type ProgressCallback = (progress: number) => void;

type AnalyzeUploadParams = {
  endpointPath: '/analyze' | '/analyze/label' | '/analyze/smart';
  imageUri: string;
  isoCountryCode: string;
  onProgress?: ProgressCallback;
};

export const performMultipartAnalysisUpload = async ({
  endpointPath,
  imageUri,
  isoCountryCode,
  onProgress,
}: AnalyzeUploadParams): Promise<any> => {
  const activeServerUrl = await ServerConfig.getServerUrl();
  const allergyString = await getAllergyString();

  const uploadResult = await uploadWithRetry(
    `${activeServerUrl}${endpointPath}`,
    imageUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      parameters: {
        allergy_info: allergyString,
        iso_country_code: isoCountryCode,
      },
    },
    3,
    onProgress,
  );

  return JSON.parse(uploadResult.body);
};

export const rethrowTimeoutAsColdStartMessage = (
  error: any,
  customMessage: string,
): never => {
  if (error.message?.includes('timed out')) {
    throw new Error(customMessage.replace('{timeout}', String(ANALYSIS_TIMEOUT_MS / 1000)));
  }
  throw error;
};

