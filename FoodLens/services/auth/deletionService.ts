import { SafeStorage } from '@/services/storage';
import {
  AuthApi,
  AuthApiError,
  AuthDeletionRequest,
  AuthDeletionRequestTarget,
  AuthSessionTokens,
} from './authApi';
import { clearSession, restoreSession } from './sessionManager';

const locallySubmittedDeletionRequestQueueIds: Set<string> = new Set();

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

const rememberLocallySubmittedDeletionRequest = (
  deletionRequest: AuthDeletionRequest
): AuthDeletionRequest => {
  locallySubmittedDeletionRequestQueueIds.add(deletionRequest.queueId);
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

export const consumeDeletionRequestFinalization = (
  deletionRequest: AuthDeletionRequest | null
): boolean => {
  if (!deletionRequest) {
    return false;
  }

  if (deletionRequest.status !== 'done') {
    return false;
  }

  if (!locallySubmittedDeletionRequestQueueIds.has(deletionRequest.queueId)) {
    return false;
  }

  locallySubmittedDeletionRequestQueueIds.delete(deletionRequest.queueId);
  return true;
};

export const clearLocalDeletionFootprint = async (): Promise<void> => {
  locallySubmittedDeletionRequestQueueIds.clear();
  await clearSession();
  await SafeStorage.clearAll();
};
