import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type IconButtonProps = Omit<React.ComponentProps<typeof Button>, 'aria-label'> & {
  /** Accessible name and tooltip text. */
  label: string;
  /** Optional longer tooltip (e.g. with the keyboard shortcut); defaults to `label`. */
  tooltip?: React.ReactNode;
};

/** Icon-only ghost button with an aria-label and a Tooltip. */
export function IconButton({ label, tooltip, variant = 'ghost', size = 'icon', children, ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size={size} aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}
