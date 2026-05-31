import {
  AuthApi,
  AuthApiError,
  AuthDeletionRequest,
  AuthDeletionRequestTarget,
  AuthSessionTokens,
} from './authApi';
import { clearLocalDeletionPrivacyFootprint } from './localFootprint';
import { restoreSession } from './sessionManager';
import { SafeStorage } from '../storage';

const LOCAL_DELETION_REQUEST_IDS_STORAGE_KEY = '@foodlens_deletion_finalization_request_ids';
const locallySubmittedDeletionRequestIds: Set<string> = new Set();
const finalizingDeletionRequestIds: Set<string> = new Set();

const normalizeDeletionRequestIds = (requestIds: unknown): string[] => {
  if (!Array.isArray(requestIds)) {
    return [];
  }
  return requestIds
    .filter((requestId): requestId is string => typeof requestId === 'string')
    .map((requestId) => requestId.trim())
    .filter((requestId) => requestId.length > 0);
};

const readRememberedDeletionRequestIds = async (): Promise<Set<string>> => {
  const storedRequestIds = await SafeStorage.get<unknown>(LOCAL_DELETION_REQUEST_IDS_STORAGE_KEY, []);
  const requestIds = new Set<string>([
    ...locallySubmittedDeletionRequestIds,
    ...normalizeDeletionRequestIds(storedRequestIds),
  ]);
  locallySubmittedDeletionRequestIds.clear();
  requestIds.forEach((requestId) => locallySubmittedDeletionRequestIds.add(requestId));
  return requestIds;
};

const writeRememberedDeletionRequestIds = async (requestIds: Set<string>): Promise<void> => {
  await SafeStorage.set(LOCAL_DELETION_REQUEST_IDS_STORAGE_KEY, [...requestIds]);
};

const clearRememberedDeletionRequestIds = async (): Promise<void> => {
  locallySubmittedDeletionRequestIds.clear();
  finalizingDeletionRequestIds.clear();
  await SafeStorage.remove(LOCAL_DELETION_REQUEST_IDS_STORAGE_KEY);
};

const restoreAuthenticatedSession = async (): Promise<AuthSessionTokens> => {
  const session = await restoreSession({
    clearCurrentUserOnMissing: false,
    logWarnings: false,
    refreshIfExpired: true,
  });

  if (!session?.accessToken) {
    throw new AuthApiError('Active session is required.', 'AUTH_SESSION_REQUIRED', 401);
  }

  return session;
};

const rememberLocallySubmittedDeletionRequest = async (
  deletionRequest: AuthDeletionRequest
): Promise<AuthDeletionRequest> => {
  if (deletionRequest.requestId) {
    const requestIds = await readRememberedDeletionRequestIds();
    requestIds.add(deletionRequest.requestId);
    await writeRememberedDeletionRequestIds(requestIds);
  }
  return deletionRequest;
};

export const getLatestDeletionRequest = async (): Promise<AuthDeletionRequest | null> => {
  const session = await restoreAuthenticatedSession();
  return AuthApi.getLatestDeletionRequest({
    accessToken: session.accessToken,
  });
};

export const createDeletionRequest = async (
  target: AuthDeletionRequestTarget
): Promise<AuthDeletionRequest> => {
  const session = await restoreAuthenticatedSession();
  const deletionRequest = await AuthApi.createDeletionRequest({
    accessToken: session.accessToken,
    target,
  });
  return rememberLocallySubmittedDeletionRequest(deletionRequest);
};

export const consumeDeletionRequestFinalization = async (
  deletionRequest: AuthDeletionRequest | null
): Promise<boolean> => {
  if (!deletionRequest) {
    return false;
  }

  if (deletionRequest.status !== 'done') {
    return false;
  }

  if (!deletionRequest.requestId || !locallySubmittedDeletionRequestIds.has(deletionRequest.requestId)) {
    const rememberedRequestIds = await readRememberedDeletionRequestIds();
    if (!deletionRequest.requestId || !rememberedRequestIds.has(deletionRequest.requestId)) {
      return false;
    }
  }

  if (finalizingDeletionRequestIds.has(deletionRequest.requestId)) {
    return false;
  }
  finalizingDeletionRequestIds.add(deletionRequest.requestId);
  return true;
};

export const clearLocalDeletionFootprint = async (): Promise<void> => {
  try {
    await clearLocalDeletionPrivacyFootprint();
    await clearRememberedDeletionRequestIds();
  } catch (error) {
    finalizingDeletionRequestIds.clear();
    throw error;
  }
};
