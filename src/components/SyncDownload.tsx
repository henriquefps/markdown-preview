import type { ReactNode } from 'react';
import { CaretDownIcon, CheckIcon, CopyIcon, DownloadSimpleIcon, ShippingContainerIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/IconButton';
import { copyWithToast, DOCKER_RUN, type DetectedPlatform, OS_ICONS, QUARANTINE_CMD, RELEASES_URL, SYNC_ASSETS } from '@/lib/syncDownloads';
import { cn } from '@/lib/utils';

/** Copy icon button that flips to a check for a moment after copying. */
export function CopyButton({ text, label = 'Copy', what, className }: { text: string; label?: string; what?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={label}
      size="icon-sm"
      className={className}
      onClick={async () => {
        await copyWithToast(text, what);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </IconButton>
  );
}

/** Monospace block with a copy button in its top-right corner. */
export function CodeBlock({ code, what, className }: { code: string; what?: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-start rounded-lg border bg-muted', className)}>
      <pre className="min-w-0 flex-1 overflow-x-auto py-3 pr-2 pl-3 font-mono text-[0.8125rem] leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} what={what} className="m-1.5 shrink-0" />
    </div>
  );
}

/** Primary button straight to the archive for the visitor's computer. */
export function DownloadButton({ platform, className }: { platform: DetectedPlatform; className?: string }) {
  if (platform.kind !== 'desktop') {
    return (
      <Button asChild className={className}>
        <a href={RELEASES_URL} target="_blank" rel="noreferrer">
          <DownloadSimpleIcon data-icon="inline-start" />
          Download from GitHub
        </a>
      </Button>
    );
  }
  return (
    <Button asChild className={className}>
      <a href={platform.asset.url} download>
        <DownloadSimpleIcon data-icon="inline-start" />
        Download for {platform.asset.label}
      </a>
    </Button>
  );
}

/** Dropdown with every archive plus the Docker command. */
export function OtherPlatformsMenu({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={className}>
          Other platforms
          <CaretDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-60">
        <DropdownMenuLabel>Download</DropdownMenuLabel>
        {SYNC_ASSETS.map((a) => {
          const Icon = OS_ICONS[a.os];
          return (
            <DropdownMenuItem key={a.file} asChild>
              <a href={a.url} download>
                <Icon />
                {a.label}
              </a>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copyWithToast(DOCKER_RUN, 'Docker command')}>
          <ShippingContainerIcon />
          Docker
          <span className="ml-auto pl-4 text-[0.8125rem] text-muted-foreground">Copy command</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MacNote({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.8125rem] text-muted-foreground">
        On macOS the binary is not notarized, so the first run is blocked. Remove the quarantine flag once (or right-click the
        file and choose Open):
      </p>
      <CodeBlock code={QUARANTINE_CMD} />
      {children}
    </div>
  );
}
