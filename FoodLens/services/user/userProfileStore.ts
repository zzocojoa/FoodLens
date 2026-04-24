export type UserProfileUpdateReason =
  | 'local_write'
  | 'server_pull'
  | 'sync_apply'
  | 'client_state_write';

type UserProfileListener = (reason: UserProfileUpdateReason) => void;

const listenersByUserId = new Map<string, Set<UserProfileListener>>();

export const subscribeUserProfileUpdated = (
  userId: string,
  listener: UserProfileListener
): (() => void) => {
  const normalized = userId.trim();
  if (!normalized) {
    return () => {};
  }

  const listeners = listenersByUserId.get(normalized) ?? new Set<UserProfileListener>();
  listeners.add(listener);
  listenersByUserId.set(normalized, listeners);

  return () => {
    const current = listenersByUserId.get(normalized);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      listenersByUserId.delete(normalized);
    }
  };
};

export const publishUserProfileUpdated = (
  userId: string,
  reason: UserProfileUpdateReason
): void => {
  const normalized = userId.trim();
  if (!normalized) {
    return;
  }

  const listeners = listenersByUserId.get(normalized);
  if (!listeners || listeners.size === 0) {
    return;
  }

  listeners.forEach((listener) => {
    try {
      listener(reason);
    } catch {
      // 리스너 오류가 publish 흐름을 끊으면 안 된다.
    }
  });
};
