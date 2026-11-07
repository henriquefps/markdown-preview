// Safe localStorage wrappers. localStorage can throw (quota exceeded, private
// mode, disabled storage); an uncaught throw inside a React effect unmounts the
// whole app, so every access goes through these helpers.

// Failure is tracked per key: a small write succeeding must not hide a failed
// write of a large key (e.g. the notes).
const failedKeys = new Set<string>();
let writeFailed = false;
const listeners = new Set<() => void>();

const updateFailedKey = (key: string, failed: boolean) => {
  if (failed) failedKeys.add(key); else failedKeys.delete(key);
  const next = failedKeys.size > 0;
  if (next === writeFailed) return;
  writeFailed = next;
  listeners.forEach((l) => l());
};

export const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    updateFailedKey(key, false);
    return true;
  } catch (err) {
    console.warn(`localStorage write failed for "${key}"`, err);
    updateFailedKey(key, true);
    return false;
  }
};

// For useSyncExternalStore: true while the latest write failed.
export const subscribeStorageStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getStorageWriteFailed = () => writeFailed;
