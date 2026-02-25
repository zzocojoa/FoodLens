import * as FileSystem from 'expo-file-system/legacy';
import { ANALYSIS_TIMEOUT_MS } from '../constants_Logic';
import { getAllergyString } from '../allergy_Logic';
import { uploadWithRetry } from '../upload_Logic';
import { ServerConfig } from '../serverConfig_Logic';
import { resolveRequestLocale } from './requestLocale_Logic';
import { assertAnalysisResponseContract } from '../contracts_Logic';
import { compressForUpload } from './imageCompress_Logic';

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
}: AnalyzeUploadParams): Promise<unknown> => {
  const activeServerUrl = await ServerConfig.getServerUrl();
  const allergyString = await getAllergyString();
  const locale = await resolveRequestLocale();

  // Compress image before upload (resizes to 1536px, JPEG 80%)
  const compressedUri = await compressForUpload(imageUri);

  const uploadResult = await uploadWithRetry(
    `${activeServerUrl}${endpointPath}`,
    compressedUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      parameters: {
        allergy_info: allergyString,
        iso_country_code: isoCountryCode,
        locale,
      },
    },
    3,
    onProgress,
  );

  const parsed = JSON.parse(uploadResult.body) as unknown;
  assertAnalysisResponseContract(parsed, endpointPath);
  return parsed;
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
