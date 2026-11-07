import {
  CloudCheckIcon,
  CloudSlashIcon,
  CloudWarningIcon,
  DotsThreeVerticalIcon,
  FilePdfIcon,
  GearSixIcon,
  LinkBreakIcon,
  LinkSimpleIcon,
  PaletteIcon,
  ArrowsClockwiseIcon,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconButton } from '@/components/IconButton';
import { ThemeMenu, ThemeMenuGroups } from '@/components/ThemeMenu';
import { cn } from '@/lib/utils';

// --muted equals the chrome background in light, so the selected view is a raised card chip.
const VIEW_ITEM = 'px-3 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs';

export type ViewMode = 'editor' | 'split' | 'preview';
export type SyncIndicator = 'off' | 'ok' | 'syncing' | 'error';

const SYNC_BADGE: Record<SyncIndicator, { label: string; className: string; variant: 'default' | 'destructive' | 'outline' }> = {
  ok: { label: 'Synced', variant: 'default', className: '' },
  syncing: { label: 'Syncing', variant: 'outline', className: 'border-warning/40 bg-warning/10 text-warning' },
  error: { label: 'Sync error', variant: 'destructive', className: '' },
  off: { label: 'Sync off', variant: 'outline', className: 'text-muted-foreground' },
};

const SYNC_ICON = {
  ok: CloudCheckIcon,
  syncing: ArrowsClockwiseIcon,
  error: CloudWarningIcon,
  off: CloudSlashIcon,
} as const;

interface TopBarProps {
  isMobile: boolean;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  sync: SyncIndicator;
  syncDetail: string;
  onOpenSync: () => void;
  syncScroll: boolean;
  onSyncScrollChange: (on: boolean) => void;
  onOpenSettings: () => void;
  onExport: () => void;
}

export function TopBar(props: TopBarProps) {
  const badge = SYNC_BADGE[props.sync];
  const SyncIcon = SYNC_ICON[props.sync];

  return (
    <header className="no-print sticky top-0 z-30 flex h-(--header-height) w-full shrink-0 items-center gap-2 bg-background px-2 md:gap-3 md:px-4">
      <SidebarTrigger className="size-9" aria-label="Toggle file list" />
      <div className="flex min-w-0 items-center gap-2">
        <img src="/favicon.svg" alt="" className="size-6 shrink-0 rounded-md" />
        <span className="hidden truncate text-[0.9375rem] font-semibold lg:inline">Markdown Previewer</span>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={props.view}
        onValueChange={(v) => v && props.onViewChange(v as ViewMode)}
        aria-label="View"
        className="ml-1 md:ml-3"
      >
        <ToggleGroupItem value="editor" className={VIEW_ITEM}>
          Editor
        </ToggleGroupItem>
        {!props.isMobile && (
          <ToggleGroupItem value="split" className={VIEW_ITEM}>
            Split
          </ToggleGroupItem>
        )}
        <ToggleGroupItem value="preview" className={VIEW_ITEM}>
          Preview
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              asChild
              variant={badge.variant}
              className={cn('hidden h-7 cursor-pointer gap-1.5 px-2.5 text-[0.8125rem] sm:inline-flex', badge.className)}
            >
              <button type="button" onClick={props.onOpenSync} aria-label={`${badge.label}. Open sync settings`}>
                <SyncIcon className={cn(props.sync === 'syncing' && 'animate-spin')} />
                {badge.label}
              </button>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{props.syncDetail}</TooltipContent>
        </Tooltip>

        {props.view === 'split' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                className="aria-pressed:bg-primary/10 aria-pressed:text-primary"
                aria-label="Synchronized scrolling"
                pressed={props.syncScroll}
                onPressedChange={props.onSyncScrollChange}
              >
                {props.syncScroll ? <LinkSimpleIcon /> : <LinkBreakIcon />}
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>{props.syncScroll ? 'Synchronized scrolling on' : 'Synchronized scrolling off'}</TooltipContent>
          </Tooltip>
        )}

        {props.isMobile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <DotsThreeVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem onSelect={props.onExport}>
                <FilePdfIcon />
                Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={props.onOpenSync}>
                <SyncIcon />
                Device sync
                <span className="ml-auto text-[0.8125rem] text-muted-foreground">{badge.label}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={props.onOpenSettings}>
                <GearSixIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <PaletteIcon />
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <ThemeMenuGroups />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <ThemeMenu />
            <IconButton label="Settings" tooltip="Preview and PDF settings" onClick={props.onOpenSettings}>
              <GearSixIcon />
            </IconButton>
            <Button onClick={props.onExport} className="ml-1">
              <FilePdfIcon data-icon="inline-start" />
              Export PDF
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
