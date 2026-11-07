import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenIcon,
  CaretDownIcon,
  CaretUpIcon,
  CodeBlockIcon,
  CodeIcon,
  DotsThreeIcon,
  ImageIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  SwapIcon,
  TableIcon,
  TextAaIcon,
  TextBIcon,
  TextHOneIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextItalicIcon,
  TrashIcon,
  TreeStructureIcon,
  XIcon,
  type Icon,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ConfirmDialog';
import { IconButton } from '@/components/IconButton';
import { cn } from '@/lib/utils';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
  onLoadSample: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  hidden?: boolean;
}

type ActionId = 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'code' | 'codeBlock' | 'link' | 'table' | 'image' | 'mermaid';

interface ToolbarAction {
  id: ActionId;
  label: string;
  icon: Icon;
}

const FORMAT_ACTIONS: ToolbarAction[][] = [
  [
    { id: 'h1', label: 'Heading 1', icon: TextHOneIcon },
    { id: 'h2', label: 'Heading 2', icon: TextHTwoIcon },
    { id: 'h3', label: 'Heading 3', icon: TextHThreeIcon },
  ],
  [
    { id: 'bold', label: 'Bold', icon: TextBIcon },
    { id: 'italic', label: 'Italic', icon: TextItalicIcon },
    { id: 'code', label: 'Inline code', icon: CodeIcon },
    { id: 'codeBlock', label: 'Code block', icon: CodeBlockIcon },
  ],
];

const INSERT_ACTIONS: ToolbarAction[] = [
  { id: 'link', label: 'Link', icon: LinkIcon },
  { id: 'table', label: 'Table', icon: TableIcon },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'mermaid', label: 'Mermaid diagram', icon: TreeStructureIcon },
];

interface MatchRange {
  start: number;
  end: number;
}

// Plain substring search (not regex) so arbitrary user text in the find field
// never gets interpreted as a pattern.
const findAllMatches = (haystack: string, query: string, caseSensitive: boolean): MatchRange[] => {
  if (!query) return [];
  const h = caseSensitive ? haystack : haystack.toLowerCase();
  const q = caseSensitive ? query : query.toLowerCase();
  const result: MatchRange[] = [];
  let from = 0;
  while (from <= h.length) {
    const found = h.indexOf(q, from);
    if (found === -1) break;
    result.push({ start: found, end: found + q.length });
    from = found + q.length;
  }
  return result;
};

export const Editor: React.FC<EditorProps> = ({ value, onChange, onClear, onLoadSample, textareaRef, hidden }) => {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  // Pane width decides which toolbar groups fit inline; the rest fold into "More". Measured
  // (not a container query) because the "More" menu is portaled outside the pane.
  const [paneWidth, setPaneWidth] = useState(1024);
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setPaneWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const insertInline = paneWidth >= 576;
  const fileActionsInline = paneWidth >= 720;
  const findInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Find & Replace
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const matches = useMemo(() => findAllMatches(value, findQuery, caseSensitive), [value, findQuery, caseSensitive]);
  const displayPosition = matches.length === 0
    ? 0
    : (currentMatchIndex >= 0 && currentMatchIndex < matches.length ? currentMatchIndex + 1 : 1);

  // Compute line numbers
  const lines = value.split('\n');
  const lineCount = Math.max(lines.length, 1);

  // The textarea soft-wraps, so one source line can span several visual rows. A hidden mirror
  // (same width, padding, font and wrapping as the textarea, one child per source line)
  // measures each line's wrapped height; every gutter entry gets that height, and lineTopsRef
  // keeps each line's top offset for find-and-replace scrolling. Heights are written to the
  // DOM directly (no state), so typing does not cost an extra render.
  const mirrorRef = useRef<HTMLDivElement>(null);
  const lineTopsRef = useRef<number[]>([]);
  const measureFrameRef = useRef(0);

  const measureLines = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    const gutter = lineNumbersRef.current;
    if (!textarea || !mirror || !gutter || textarea.clientWidth === 0) return;
    const cs = getComputedStyle(textarea);
    const ms = mirror.style;
    ms.width = `${textarea.clientWidth}px`;
    ms.boxSizing = 'border-box';
    ms.paddingLeft = cs.paddingLeft;
    ms.paddingRight = cs.paddingRight;
    ms.font = cs.font;
    ms.lineHeight = cs.lineHeight;
    ms.letterSpacing = cs.letterSpacing;
    ms.wordSpacing = cs.wordSpacing;
    ms.tabSize = cs.tabSize;
    ms.textTransform = cs.textTransform;
    ms.whiteSpace = 'pre-wrap';
    ms.overflowWrap = cs.overflowWrap;
    ms.wordBreak = cs.wordBreak;

    const sourceLines = textarea.value.split('\n');
    const rows = sourceLines.map((line) => {
      const row = document.createElement('div');
      // An empty line still occupies one row.
      row.textContent = line.length > 0 ? line : '\u200b';
      return row;
    });
    mirror.replaceChildren(...rows);

    const fallback = parseFloat(cs.lineHeight) || 24;
    const tops: number[] = [];
    let top = 0;
    const entries = gutter.children;
    rows.forEach((row, i) => {
      const height = row.getBoundingClientRect().height || fallback;
      tops.push(top);
      top += height;
      const entry = entries[i] as HTMLElement | undefined;
      if (entry) entry.style.height = `${height}px`;
    });
    lineTopsRef.current = tops;
    mirror.replaceChildren();
    // Make the gutter's scrollable height equal the textarea's (incl. bottom padding and any
    // rounding), so it can never stop short of or drift from the textarea at the scroll end.
    const gutterPadTop = parseFloat(getComputedStyle(gutter).paddingTop) || 0;
    gutter.style.paddingBottom = '0px';
    const needed = textarea.scrollHeight - gutterPadTop - top;
    gutter.style.paddingBottom = `${Math.max(needed, parseFloat(cs.paddingBottom) || 0)}px`;
    gutter.scrollTop = textarea.scrollTop;
  }, [textareaRef]);

  const scheduleMeasure = useCallback(() => {
    cancelAnimationFrame(measureFrameRef.current);
    measureFrameRef.current = requestAnimationFrame(measureLines);
  }, [measureLines]);

  // Re-measure before paint whenever the text changes.
  useLayoutEffect(() => {
    measureLines();
  }, [value, measureLines]);

  // ...and whenever the textarea's size changes (window resize, Resizable panel drags, sidebar
  // toggle, view switch) or the editor font finishes loading.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(textarea);
    document.fonts?.ready.then(scheduleMeasure).catch(() => undefined);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(measureFrameRef.current);
    };
  }, [textareaRef, scheduleMeasure]);

  // Synchronize scrolling of line numbers and textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // Selects a match in the textarea and scrolls it into view. Selection is
  // set even when not focusing the textarea, so the find input can keep
  // keyboard focus while cycling through results (same as most editors).
  const selectMatch = (haystack: string, match: MatchRange, focusTextarea: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.setSelectionRange(match.start, match.end);
    if (focusTextarea) {
      textarea.focus();
    }
    const lineNumber = haystack.slice(0, match.start).split('\n').length - 1;
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    // Measured top of the (possibly wrapped) source line; falls back to one row per line.
    const lineTop = lineTopsRef.current[lineNumber] ?? lineNumber * lineHeight;
    const targetScrollTop = paddingTop + lineTop - textarea.clientHeight / 2 + lineHeight / 2;
    textarea.scrollTop = Math.max(0, targetScrollTop);
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textarea.scrollTop;
    }
  };

  const goToMatch = (haystack: string, matchList: MatchRange[], index: number, focusTextarea: boolean) => {
    if (matchList.length === 0) {
      setCurrentMatchIndex(-1);
      return;
    }
    const clamped = ((index % matchList.length) + matchList.length) % matchList.length;
    setCurrentMatchIndex(clamped);
    selectMatch(haystack, matchList[clamped], focusTextarea);
  };

  const nearestMatchIndexFromCursor = (matchList: MatchRange[]) => {
    const cursor = textareaRef.current ? textareaRef.current.selectionStart : 0;
    const idx = matchList.findIndex((m) => m.start >= cursor);
    return idx === -1 ? 0 : idx;
  };

  const handleFindQueryChange = (query: string) => {
    setFindQuery(query);
    const newMatches = findAllMatches(value, query, caseSensitive);
    if (newMatches.length === 0) {
      setCurrentMatchIndex(-1);
      return;
    }
    goToMatch(value, newMatches, nearestMatchIndexFromCursor(newMatches), false);
  };

  const handleToggleCaseSensitive = () => {
    const next = !caseSensitive;
    setCaseSensitive(next);
    const newMatches = findAllMatches(value, findQuery, next);
    if (newMatches.length === 0) {
      setCurrentMatchIndex(-1);
      return;
    }
    goToMatch(value, newMatches, nearestMatchIndexFromCursor(newMatches), false);
  };

  const handleFindNext = () => {
    if (matches.length === 0) return;
    const startIdx = currentMatchIndex === -1 ? nearestMatchIndexFromCursor(matches) : currentMatchIndex + 1;
    goToMatch(value, matches, startIdx, false);
  };

  const handleFindPrevious = () => {
    if (matches.length === 0) return;
    const startIdx = currentMatchIndex === -1 ? nearestMatchIndexFromCursor(matches) - 1 : currentMatchIndex - 1;
    goToMatch(value, matches, startIdx, false);
  };

  const handleReplace = () => {
    if (matches.length === 0) return;
    const idx = currentMatchIndex !== -1 && currentMatchIndex < matches.length
      ? currentMatchIndex
      : nearestMatchIndexFromCursor(matches);
    const match = matches[idx];
    const newValue = value.slice(0, match.start) + replaceQuery + value.slice(match.end);
    onChange(newValue);

    const updatedMatches = findAllMatches(newValue, findQuery, caseSensitive);
    if (updatedMatches.length === 0) {
      setCurrentMatchIndex(-1);
      return;
    }
    const nextIdx = updatedMatches.findIndex((m) => m.start >= match.start);
    goToMatch(newValue, updatedMatches, nextIdx === -1 ? 0 : nextIdx, false);
  };

  const handleReplaceAll = () => {
    if (matches.length === 0) return;
    setConfirm({
      title: `Replace all ${matches.length} ${matches.length === 1 ? 'occurrence' : 'occurrences'}?`,
      description: `Every "${findQuery}" in this file becomes "${replaceQuery}".`,
      confirmLabel: 'Replace all',
      onConfirm: () => replaceAllNow(matches),
    });
  };

  const replaceAllNow = (matchList: MatchRange[]) => {
    let newValue = '';
    let cursor = 0;
    for (const m of matchList) {
      newValue += value.slice(cursor, m.start) + replaceQuery;
      cursor = m.end;
    }
    newValue += value.slice(cursor);
    onChange(newValue);
    setCurrentMatchIndex(-1);
  };

  const openFind = () => {
    setIsFindOpen(true);
    requestAnimationFrame(() => findInputRef.current?.focus());
  };

  const closeFind = useCallback(() => {
    setIsFindOpen(false);
    setCurrentMatchIndex(-1);
    textareaRef.current?.focus();
  }, [textareaRef]);

  const handleEditorPaneKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openFind();
    }
  };

  // A button inside the bar (e.g. "Replace All") can end up disabled right
  // after the click that triggered it (once its match count hits zero),
  // which drops browser focus out of the editor pane entirely. Listening on
  // window instead of relying on bubbling keeps Escape working regardless of
  // where focus landed.
  useEffect(() => {
    if (!isFindOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Escape inside an open dialog belongs to the dialog, not the find bar.
      if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) {
        closeFind();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFindOpen, closeFind]);

  const handleFindInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) handleFindPrevious(); else handleFindNext();
    }
    // Escape is handled by the window-level listener above.
  };

  const handleReplaceInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleReplace();
    }
    // Escape is handled by the window-level listener above.
  };

  // Helper to insert markdown tags at cursor position
  const insertText = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selectedText = text.substring(start, end) || defaultText;
    const replacement = before + selectedText + after;

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    onChange(newValue);

    // Reset cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selectedText.length
      );
    }, 0);
  };

  // Toolbar Actions
  const handleBold = () => insertText('**', '**', 'bold text');
  const handleItalic = () => insertText('*', '*', 'italic text');
  const handleCode = () => insertText('`', '`', 'code');
  const handleCodeBlock = () => insertText('```javascript\n', '\n```', 'console.log("hello");');
  const handleLink = () => insertText('[', '](https://example.com)', 'link text');
  
  const handleTable = () => {
    const tableTemplate = 
      '\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n| Cell 3   | Cell 4   |\n';
    insertText(tableTemplate);
  };

  const handleMermaid = () => {
    const mermaidTemplate = 
      '\n```mermaid\ngraph TD\n    A[Start] --> B(Process)\n    B --> C{Decision}\n    C -->|Yes| D[Result 1]\n    C -->|No| E[Result 2]\n```\n';
    insertText(mermaidTemplate);
  };

  const handleImage = () => {
    insertText('![Image Description](', ')', 'https://picsum.photos/800/400');
  };

  const handleHeading = (level: 1 | 2 | 3) => {
    const prefix = '#'.repeat(level) + ' ';
    insertText('\n' + prefix, '', `Heading ${level}`);
  };

  // Handle Drag & Drop of Images. dragenter/dragleave also fire for every child
  // element the cursor crosses, so count them instead of toggling on each event.
  const dragDepthRef = useRef(0);

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  const handleDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  // Embeds every image in `files` with a single insertion, so concurrent
  // FileReader callbacks can't overwrite each other.
  const processFiles = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      toast.error('Only images can be embedded directly.');
      return;
    }
    try {
      const urls = await Promise.all(images.map(readAsDataUrl));
      const markdown = images.map((file, i) => `\n![${file.name}](${urls[i]})\n`).join('');
      insertText(markdown);
    } catch (err) {
      console.error('Failed to read image', err);
      toast.error('Could not read one of the images.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Handle Clipboard Paste
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      void processFiles(Array.from(e.clipboardData.files));
    }
  };

  const runAction = (id: ActionId) => {
    switch (id) {
      case 'h1': return handleHeading(1);
      case 'h2': return handleHeading(2);
      case 'h3': return handleHeading(3);
      case 'bold': return handleBold();
      case 'italic': return handleItalic();
      case 'code': return handleCode();
      case 'codeBlock': return handleCodeBlock();
      case 'link': return handleLink();
      case 'table': return handleTable();
      case 'image': return handleImage();
      case 'mermaid': return handleMermaid();
    }
  };

  const renderButtons = (actions: ToolbarAction[]) =>
    actions.map(({ id, label, icon: ActionIcon }) => (
      <IconButton key={id} label={label} onClick={() => runAction(id)}>
        <ActionIcon />
      </IconButton>
    ));

  return (
    <section
      ref={paneRef}
      aria-label="Editor"
      className={cn('@container/editor flex h-full min-h-0 min-w-0 flex-col no-print', hidden && 'pane-hidden')}
      onKeyDown={handleEditorPaneKeyDown}
    >
      {/* Markdown toolbar. The insert group and the file actions fold into "More" on narrow panes. */}
      <div role="toolbar" aria-label="Formatting" className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
        {FORMAT_ACTIONS.map((group, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />}
            {renderButtons(group)}
          </React.Fragment>
        ))}
        {insertInline && (
          <>
            <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
            {renderButtons(INSERT_ACTIONS)}
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Find and replace" tooltip="Find and replace (Ctrl/Cmd+F)" onClick={openFind}>
            <MagnifyingGlassIcon />
          </IconButton>
          {fileActionsInline ? (
            <>
              <IconButton label="Load sample" tooltip="Load the sample document" onClick={onLoadSample}>
                <BookOpenIcon />
              </IconButton>
              <IconButton label="Clear editor" onClick={onClear}>
                <TrashIcon />
              </IconButton>
            </>
          ) : (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More editor actions">
                    <DotsThreeIcon />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {!insertInline && (
                <>
                  {INSERT_ACTIONS.map(({ id, label, icon: ActionIcon }) => (
                    <DropdownMenuItem key={id} onSelect={() => runAction(id)}>
                      <ActionIcon />
                      {label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={onLoadSample}>
                <BookOpenIcon />
                Load sample
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onClear}>
                <TrashIcon />
                Clear editor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>

      {/* Find & replace */}
      {isFindOpen && (
        <div role="search" className="flex shrink-0 flex-col gap-2 border-b px-3 py-2 @xl/editor:px-4">
          <div className="flex items-center gap-1">
            <InputGroup className="min-w-0 flex-1">
              <InputGroupAddon>
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                ref={findInputRef}
                aria-label="Find"
                placeholder="Find"
                value={findQuery}
                onChange={(e) => handleFindQueryChange(e.target.value)}
                onKeyDown={handleFindInputKeyDown}
              />
              {findQuery && (
                <InputGroupAddon align="inline-end">
                  <InputGroupText className="text-[0.8125rem] font-normal tabular-nums" aria-live="polite">
                    {matches.length === 0 ? 'No results' : `${displayPosition} of ${matches.length}`}
                  </InputGroupText>
                </InputGroupAddon>
              )}
            </InputGroup>
            <IconButton label="Previous match" tooltip="Previous (Shift+Enter)" onClick={handleFindPrevious} disabled={matches.length === 0}>
              <CaretUpIcon />
            </IconButton>
            <IconButton label="Next match" tooltip="Next (Enter)" onClick={handleFindNext} disabled={matches.length === 0}>
              <CaretDownIcon />
            </IconButton>
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle className="aria-pressed:bg-primary/10 aria-pressed:text-primary" aria-label="Match case" pressed={caseSensitive} onPressedChange={handleToggleCaseSensitive}>
                  <TextAaIcon />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>Match case</TooltipContent>
            </Tooltip>
            <IconButton label="Close find" tooltip="Close (Esc)" onClick={closeFind}>
              <XIcon />
            </IconButton>
          </div>
          <div className="flex flex-wrap items-center gap-1 @md/editor:flex-nowrap">
            <InputGroup className="min-w-0 basis-full @md/editor:basis-auto @md/editor:flex-1">
              <InputGroupAddon>
                <SwapIcon />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Replace with"
                placeholder="Replace"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={handleReplaceInputKeyDown}
              />
            </InputGroup>
            <Button variant="outline" onClick={handleReplace} disabled={matches.length === 0}>
              Replace
            </Button>
            <Button variant="outline" onClick={handleReplaceAll} disabled={matches.length === 0}>
              Replace all
            </Button>
          </div>
        </div>
      )}

      {/* Editor area */}
      <div
        className="relative flex min-h-0 flex-1"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-primary bg-card/90 text-primary animate-in fade-in-0">
            <ImageIcon className="size-10" aria-hidden />
            <p className="text-base font-semibold">Drop the image here to embed it</p>
          </div>
        )}

        {/* Line numbers, scrolled in step with the textarea. overflow-hidden (not visible) so
            JS can drive scrollTop without the gutter becoming its own scroller. */}
        <div
          ref={lineNumbersRef}
          aria-hidden
          className="line-numbers w-12 shrink-0 overflow-hidden border-r pt-4 pr-2 text-right font-mono text-[0.8125rem] leading-6 text-muted-foreground tabular-nums select-none"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          aria-label="Markdown source"
          spellCheck={false}
          className="min-w-0 flex-1 resize-none bg-transparent p-4 font-mono text-base leading-6 text-foreground caret-primary outline-none placeholder:text-muted-foreground md:text-sm"
          placeholder="Type your markdown here… drag and drop or paste images, or insert a Mermaid graph."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onPaste={handlePaste}
        />

        {/* Measuring mirror for wrapped line heights (see measureLines). */}
        <div
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none invisible absolute top-0 left-0 h-0 overflow-hidden"
        />
      </div>

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
};
