// Client for the local-network sync server (see sync-server/). The server is
// the merge authority: we always send our full local note list and it always
// hands back the full merged (last-write-wins per id) list in one round trip.

export interface SyncNote {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  deleted?: boolean;
}

export const normalizeSyncServerUrl = (url: string): string => url.trim().replace(/\/+$/, '');

export async function syncNotes(serverUrl: string, notes: SyncNote[], apiKey?: string): Promise<SyncNote[]> {
  const base = normalizeSyncServerUrl(serverUrl);
  if (!base) {
    throw new Error('No sync server address configured.');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ notes })
    });
  } catch {
    // A browser can't distinguish "server unreachable" from "blocked by
    // policy" in the error it hands to JS, but a page served over HTTPS
    // making a plain-HTTP request is the single most common cause here
    // (Mixed Content): the browser refuses to even attempt it.
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http://')) {
      throw new Error(
        'Blocked: this page is HTTPS but the sync server address is plain HTTP. ' +
        'Browsers refuse HTTPS pages making HTTP requests ("mixed content"). ' +
        'Serve the sync server over HTTPS too, or access this app itself via a plain-HTTP LAN address.'
      );
    }
    throw new Error('Could not reach the sync server. Is it running and on the same network?');
  }

  if (res.status === 401) {
    throw new Error('Sync server rejected the request: missing or wrong API key.');
  }
  if (!res.ok) {
    throw new Error(`Sync server responded with HTTP ${res.status}.`);
  }

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.notes)) {
    throw new Error('Sync server returned an unexpected response.');
  }
  return data.notes;
}
