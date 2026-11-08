import { useEffect, useState } from 'react';
import { AppleLogoIcon, LinuxLogoIcon, WindowsLogoIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';

// The sync server's GoReleaser archives have no version in their name, so these URLs always
// point at the newest release (see sync-server/.goreleaser.yaml).
export const REPO_URL = 'https://github.com/henriquefps/markdown-preview';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
const DOWNLOAD_BASE = `${RELEASES_URL}/download`;
export const CHECKSUMS_URL = `${DOWNLOAD_BASE}/checksums.txt`;
export const SYNC_GUIDE_PATH = '/sync';

export const DOCKER_IMAGE = 'ghcr.io/henriquefps/markdown-preview-sync';
export const DOCKER_RUN = `docker run -p 3041:3041 -v markdown-sync-data:/app/data ${DOCKER_IMAGE}`;

export type Os = 'darwin' | 'linux' | 'windows';
export type Arch = 'amd64' | 'arm64';

export const OS_ICONS: Record<Os, typeof AppleLogoIcon> = {
  darwin: AppleLogoIcon,
  windows: WindowsLogoIcon,
  linux: LinuxLogoIcon,
};

/** First run of the (not notarized) macOS binary. */
export const QUARANTINE_CMD = 'xattr -d com.apple.quarantine ./markdown-preview-sync';

export interface SyncAsset {
  os: Os;
  arch: Arch;
  label: string;
  file: string;
  url: string;
}

function asset(os: Os, arch: Arch, label: string): SyncAsset {
  const file = `markdown-preview-sync_${os}_${arch}.${os === 'windows' ? 'zip' : 'tar.gz'}`;
  return { os, arch, label, file, url: `${DOWNLOAD_BASE}/${file}` };
}

export const SYNC_ASSETS: SyncAsset[] = [
  asset('darwin', 'arm64', 'macOS (Apple Silicon)'),
  asset('darwin', 'amd64', 'macOS (Intel)'),
  asset('windows', 'amd64', 'Windows (Intel/AMD)'),
  asset('windows', 'arm64', 'Windows (ARM)'),
  asset('linux', 'amd64', 'Linux (Intel/AMD)'),
  asset('linux', 'arm64', 'Linux (ARM, Raspberry Pi)'),
];

export function findAsset(os: Os, arch: Arch): SyncAsset {
  return SYNC_ASSETS.find((a) => a.os === os && a.arch === arch)!;
}

/** What the visitor is on: a computer we can offer a binary for, a phone/tablet, or unknown. */
export type DetectedPlatform =
  | { kind: 'desktop'; asset: SyncAsset }
  | { kind: 'mobile' }
  | { kind: 'unknown' };

interface UADataLike {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; platform?: string }>;
}

function uaData(): UADataLike | undefined {
  return (navigator as Navigator & { userAgentData?: UADataLike }).userAgentData;
}

function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  if (uaData()?.mobile) return true;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

function osFrom(platform: string): Os | null {
  const p = platform.toLowerCase();
  if (p.includes('mac')) return 'darwin';
  if (p.includes('win')) return 'windows';
  if (p.includes('linux') || p.includes('x11') || p.includes('cros') || p.includes('chrome os')) return 'linux';
  return null;
}

/** Synchronous best guess from userAgent / platform. */
export function detectPlatformSync(): DetectedPlatform {
  if (typeof navigator === 'undefined') return { kind: 'unknown' };
  if (isMobileDevice()) return { kind: 'mobile' };
  const ua = navigator.userAgent;
  const os = osFrom(uaData()?.platform || navigator.platform || '') ?? osFrom(ua);
  if (!os) return { kind: 'unknown' };
  // macOS: Safari and Firefox always say "Intel Mac OS X", so default to Apple Silicon.
  let arch: Arch = os === 'darwin' ? 'arm64' : 'amd64';
  if (os === 'linux' && /aarch64|arm64/i.test(`${ua} ${navigator.platform}`)) arch = 'arm64';
  if (os === 'windows' && /ARM64|aarch64/i.test(ua)) arch = 'arm64';
  return { kind: 'desktop', asset: findAsset(os, arch) };
}

/** Refines the guess with User-Agent Client Hints (Chromium) when available. */
async function detectPlatformAsync(fallback: DetectedPlatform): Promise<DetectedPlatform> {
  const data = uaData();
  if (fallback.kind !== 'desktop' || !data?.getHighEntropyValues) return fallback;
  try {
    const hints = await data.getHighEntropyValues(['architecture', 'platform']);
    const os = osFrom(hints.platform ?? '') ?? fallback.asset.os;
    const reported = (hints.architecture ?? '').toLowerCase();
    let arch: Arch = fallback.asset.arch;
    if (reported === 'arm') arch = 'arm64';
    else if (reported === 'x86') arch = 'amd64';
    return { kind: 'desktop', asset: findAsset(os, arch) };
  } catch {
    return fallback;
  }
}

export function useDetectedPlatform(): DetectedPlatform {
  const [platform, setPlatform] = useState<DetectedPlatform>(detectPlatformSync);
  useEffect(() => {
    let cancelled = false;
    detectPlatformAsync(detectPlatformSync()).then((p) => {
      if (!cancelled) setPlatform(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return platform;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyWithToast(text: string, what = 'Command') {
  if (await copyText(text)) toast.success(`${what} copied`);
  else toast.error('Could not copy. Select the text and copy it manually.');
}
