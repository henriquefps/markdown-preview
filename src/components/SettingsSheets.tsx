import type { KeyboardEvent, ReactNode } from 'react';
import { ArrowsClockwiseIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Full screen below sm, a side panel from sm up. The base sheet sets w-3/4 and sm:max-w-sm as
// data-[side=right] variants, so override with the same variants (the mobile sidebar Sheet
// keeps its 3/4 width).
const SHEET_CLASS =
  'gap-0 data-[side=right]:w-full data-[side=right]:max-sm:border-l-0 data-[side=right]:sm:w-3/4 data-[side=right]:sm:max-w-md';

function SettingsSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn(SHEET_CLASS, 'no-print')}>
        <SheetHeader className="border-b pr-14">
          <SheetTitle className="text-lg font-semibold">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-[0.8125rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface Option {
  value: string;
  label: string;
}

function SelectField({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

const FONT_FAMILIES: Option[] = [
  { value: "'Inter', system-ui, sans-serif", label: 'Sans-serif (Inter)' },
  { value: "Georgia, Cambria, 'Times New Roman', serif", label: 'Serif (Georgia)' },
  { value: "'Fira Code', Consolas, Monaco, monospace", label: 'Monospace (Fira Code)' },
];
const FONT_SIZES: Option[] = [
  { value: '0.875rem', label: 'Small (14px)' },
  { value: '1rem', label: 'Medium (16px)' },
  { value: '1.125rem', label: 'Large (18px)' },
  { value: '1.25rem', label: 'Extra large (20px)' },
];
const LINE_HEIGHTS: Option[] = [
  { value: '1.3', label: 'Compact (1.3)' },
  { value: '1.7', label: 'Normal (1.7)' },
  { value: '2.2', label: 'Double (2.2)' },
];
const MARGINS: Option[] = [
  { value: '0', label: 'None' },
  { value: '1rem', label: 'Compact (1rem)' },
  { value: '1.5rem', label: 'Default (1.5rem)' },
  { value: '2rem', label: 'Standard (2rem)' },
  { value: '3.5rem', label: 'Wide (3.5rem)' },
];

export interface PreviewSettings {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  margin: string;
}

export function PreviewSettingsSheet({
  open,
  onOpenChange,
  settings,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PreviewSettings;
  onChange: (patch: Partial<PreviewSettings>) => void;
}) {
  return (
    <SettingsSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Typography for the preview and the exported PDF."
    >
      <SelectField
        id="preview-font-family"
        label="Font family"
        value={settings.fontFamily}
        options={FONT_FAMILIES}
        onChange={(fontFamily) => onChange({ fontFamily })}
      />
      <SelectField
        id="preview-font-size"
        label="Font size"
        value={settings.fontSize}
        options={FONT_SIZES}
        onChange={(fontSize) => onChange({ fontSize })}
      />
      <SelectField
        id="preview-line-height"
        label="Line spacing"
        value={settings.lineHeight}
        options={LINE_HEIGHTS}
        onChange={(lineHeight) => onChange({ lineHeight })}
      />
      <SelectField
        id="preview-margin"
        label="PDF margins"
        hint="Page margin used when printing or exporting to PDF."
        value={settings.margin}
        options={MARGINS}
        onChange={(margin) => onChange({ margin })}
      />
    </SettingsSheet>
  );
}

export function SyncSettingsSheet({
  open,
  onOpenChange,
  enabled,
  onEnabledChange,
  serverUrl,
  onServerUrlChange,
  apiKey,
  onApiKeyChange,
  onSyncNow,
  syncing,
  statusText,
  statusTone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onSyncNow: () => void;
  syncing: boolean;
  statusText: string;
  statusTone: 'muted' | 'error';
}) {
  // Text fields commit on blur / Enter (not per keystroke), so a half-typed address never
  // starts a sync. They remount (key) each time the sheet opens to pick up the saved value.
  const commitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };
  return (
    <SettingsSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Device sync"
      description="Keep notes in sync across devices through your own sync server."
    >
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="sync-enabled">Sync this device</Label>
          <p className="text-[0.8125rem] text-muted-foreground">Sends and receives changes every 15 seconds.</p>
        </div>
        <Switch id="sync-enabled" checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      <Field id="sync-server-url" label="Server address">
        <Input
          key={open ? 'url-open' : 'url-closed'}
          id="sync-server-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="http://192.168.1.10:3041"
          defaultValue={serverUrl}
          onBlur={(e) => onServerUrlChange(e.target.value.trim())}
          onKeyDown={commitOnEnter}
        />
      </Field>
      <Field id="sync-api-key" label="API key" hint="Only if your server requires one. Leave empty for a LAN-only server.">
        <Input
          key={open ? 'key-open' : 'key-closed'}
          id="sync-api-key"
          type="password"
          autoComplete="off"
          defaultValue={apiKey}
          onBlur={(e) => onApiKeyChange(e.target.value.trim())}
          onKeyDown={commitOnEnter}
        />
      </Field>
      <Separator />
      <div className="flex flex-col gap-3">
        <Button variant="outline" onClick={onSyncNow} disabled={!enabled || !serverUrl.trim() || syncing} className="self-start">
          <ArrowsClockwiseIcon data-icon="inline-start" className={cn(syncing && 'animate-spin')} />
          Sync now
        </Button>
        <p
          role="status"
          className={cn('text-sm [overflow-wrap:anywhere]', statusTone === 'error' ? 'text-destructive' : 'text-muted-foreground')}
        >
          {statusText}
        </p>
      </div>
    </SettingsSheet>
  );
}
