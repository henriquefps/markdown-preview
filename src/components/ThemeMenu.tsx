import { DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  isPalette,
  isTheme,
  PALETTE_SWATCHES,
  PALETTES,
  type Palette,
  setPalette,
  setTheme,
  THEMES,
  usePalette,
  useTheme,
} from '@/lib/theme/theme';

// Labels are plain strings; swap them for t(...) if the app has i18n.
const THEME_LABELS = { light: 'Light', dark: 'Dark', system: 'System' } as const;
const PALETTE_LABELS: Record<Palette, string> = {
  olive: 'Olive',
  blue: 'Blue',
  violet: 'Violet',
  rose: 'Rose',
  graphite: 'Graphite',
};
const THEME_ICONS = { light: SunIcon, dark: MoonIcon, system: DesktopIcon } as const;

/** Round color preview; decorative, the label next to it names the palette. */
function PaletteSwatch({ palette }: { palette: Palette }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 shrink-0 rounded-full border border-border"
      style={{ backgroundColor: PALETTE_SWATCHES[palette] }}
    />
  );
}

/** Top bar menu: Light/Dark/System, then the palette. The trigger shows the theme choice. */
export function ThemeMenu() {
  const theme = useTheme();
  const Current = THEME_ICONS[theme];
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Theme">
              <Current />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Theme and palette</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <ThemeMenuGroups />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The theme and palette radio groups; reused inside the phone overflow menu. */
export function ThemeMenuGroups() {
  const theme = useTheme();
  const palette = usePalette();
  return (
    <>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={(v) => isTheme(v) && setTheme(v)}>
        {THEMES.map((option) => {
          const Icon = THEME_ICONS[option];
          return (
            <DropdownMenuRadioItem key={option} value={option}>
              <Icon />
              {THEME_LABELS[option]}
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Palette</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={palette} onValueChange={(v) => isPalette(v) && setPalette(v)}>
        {PALETTES.map((option) => (
          <DropdownMenuRadioItem key={option} value={option}>
            <PaletteSwatch palette={option} />
            {PALETTE_LABELS[option]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}
