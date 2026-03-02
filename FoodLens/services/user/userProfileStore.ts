export type UserProfileUpdateReason = 'local_write' | 'server_pull' | 'sync_apply';

type UserProfileListener = () => void;

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
  _reason: UserProfileUpdateReason
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
      listener();
    } catch {
      // Listener errors must not interrupt publish flow.
    }
  });
};
