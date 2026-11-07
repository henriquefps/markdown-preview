// Safe localStorage wrappers. localStorage can throw (quota exceeded, private
// mode, disabled storage); an uncaught throw inside a React effect unmounts the
// whole app, so every access goes through these helpers.

let writeFailed = false;
const listeners = new Set<() => void>();

const setWriteFailed = (value: boolean) => {
  if (writeFailed === value) return;
  writeFailed = value;
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
    setWriteFailed(false);
    return true;
  } catch (err) {
    console.warn(`localStorage write failed for "${key}"`, err);
    setWriteFailed(true);
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
