import { useEffect, useRef, useState } from 'react';
import { DotsThreeIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';

export interface SidebarFile {
  id: string;
  title: string;
  updatedAt: number;
}

interface FileSidebarProps {
  files: SidebarFile[];
  activeId: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRequestDelete: (id: string) => void;
  editingId: string | null;
  onStartRename: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onCancelRename: () => void;
}

// Re-renders the relative times once a minute.
function useNow(intervalMs = 60000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function RenameInput({ initial, onSave, onCancel }: { initial: string; onSave: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Escape cancels; the blur that follows unmounting must not save.
  const cancelled = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  return (
    <Input
      ref={ref}
      aria-label="File name"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => !cancelled.current && onSave(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave(value);
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancelled.current = true;
          onCancel();
        }
      }}
      className="h-9 text-[0.9375rem]"
    />
  );
}

export function FileSidebar(props: FileSidebarProps) {
  const now = useNow();
  return (
    <Sidebar
      variant="inset"
      className="no-print top-(--header-height) h-[calc(100svh-var(--header-height))]!"
    >
      <SidebarHeader className="gap-2">
        <Button onClick={props.onCreate} className="w-full">
          <PlusIcon data-icon="inline-start" />
          New file
        </Button>
        <InputGroup className="bg-card">
          <InputGroupAddon>
            <MagnifyingGlassIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search files"
            placeholder="Search files"
            value={props.searchQuery}
            onChange={(e) => props.onSearchChange(e.target.value)}
          />
          {props.searchQuery && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => props.onSearchChange('')}>
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="eyebrow h-auto pb-1">Files</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {props.files.map((file) => {
                const active = file.id === props.activeId;
                const editing = file.id === props.editingId;
                return (
                  <SidebarMenuItem key={file.id}>
                    {editing ? (
                      <div className="px-1 py-2">
                        <RenameInput
                          initial={file.title}
                          onSave={(title) => props.onRename(file.id, title)}
                          onCancel={props.onCancelRename}
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          'group/file relative flex min-h-14 items-center rounded-md transition-colors hover:bg-muted/50',
                          active && 'bg-muted shadow-[inset_2px_0_0_var(--primary)] hover:bg-muted'
                        )}
                      >
                        <button
                          type="button"
                          aria-current={active ? 'page' : undefined}
                          onClick={() => props.onSelect(file.id)}
                          onDoubleClick={() => props.onStartRename(file.id)}
                          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md py-2 pr-10 pl-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className={cn('w-full truncate text-[0.9375rem]', active && 'font-medium')}>{file.title}</span>
                          <span
                            className="text-[0.8125rem] text-muted-foreground"
                            title={new Date(file.updatedAt).toLocaleString()}
                          >
                            {relativeTime(file.updatedAt, now)}
                          </span>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${file.title}`}
                              className="absolute top-1/2 right-1 -translate-y-1/2"
                            >
                              <DotsThreeIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="right">
                            <DropdownMenuItem onSelect={() => props.onStartRename(file.id)}>
                              <PencilSimpleIcon />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => props.onRequestDelete(file.id)}>
                              <TrashIcon />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            {props.files.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No files found</p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
