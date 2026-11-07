import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore, type ComponentProps } from 'react';
import { WarningIcon } from '@phosphor-icons/react';
import { useDefaultLayout } from 'react-resizable-panels';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ConfirmDialog';
import { Editor } from '@/components/Editor';
import { FileSidebar } from '@/components/FileSidebar';
import { Preview } from '@/components/Preview';
import { PreviewSettingsSheet, SyncSettingsSheet, type PreviewSettings } from '@/components/SettingsSheets';
import { TopBar, type SyncIndicator, type ViewMode } from '@/components/TopBar';
import { syncNotes, type SyncNote } from '@/lib/sync';
import { safeGetItem, safeSetItem, subscribeStorageStatus, getStorageWriteFailed } from '@/lib/storage';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import './components/MarkdownViewer.css';

const SAMPLE_MARKDOWN = `# Markdown Previewer Showcase 🚀

Welcome! This is a complete, feature-rich markdown editor and live rendering preview application.

Created by [Henrique Silva](https://hfps.dev) using React and Vite.

---

## 🎨 Rich Features
- **Split-Pane Layout** with synchronized scrolling & mobile responsiveness.
- **Themes & Palettes**: Light, Dark or System, plus Olive, Blue, Violet, Rose and Graphite color palettes.
- **Settings & Customization**: Configure your preferred font family, font size, line spacing, and margins. These settings will automatically apply to both your live preview and the exported PDF!
- **Drag & Drop / Paste Images**: Drop any image file directly onto the editor or paste from clipboard to instantly embed as a Base64 URI.
- **High-Fidelity PDF Export**: Use the **Export PDF** button to print or save your document as a beautifully formatted PDF (forced to clean Light mode automatically).

---

## 📊 Elements & Formatting

### 📐 Tables
| Technology | Category | Rating |
| :--- | :--- | :---: |
| React | Frontend Library | ⭐⭐⭐⭐⭐ |
| Vite | Build Tool | ⭐⭐⭐⭐⭐ |
| Cloudflare Pages | Hosting Platform | ⭐⭐⭐⭐⭐ |
| Mermaid.js | Diagrams | ⭐⭐⭐⭐ |

### 🔢 Mathematical Notation (LaTeX)
Inline math renders right in the middle of a sentence: as $x \\rightarrow \\infty$, the function converges to $a \\leftarrow b$.

Block equations get their own centered line:

$$
\\int_0^\\infty e^{-x} \\, dx = 1 \\qquad \\sum_{i=1}^n i = \\frac{n(n+1)}{2}
$$

### 💻 Code Syntax Highlighting
Here is an example of an inline code snippet: \`const app = new MarkdownPreviewer()\` (which renders cleanly inline instead of block-wide).

And here is a multi-line syntax-highlighted block with an instant copy button:
\`\`\`javascript
// Example function to calculate Fibonacci numbers
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("Fibonacci(10):", fibonacci(10));
\`\`\`

### 🧜‍♂️ Mermaid Diagrams
\`\`\`mermaid
graph TD
    A[Write Markdown] --> B{Choose Theme}
    B -->|Light| C[Clean Light]
    B -->|Dark| D[Elegant Dark]
    B -->|System| E[Follows your OS]
    C --> G[Export PDF]
    D --> G
    E --> G
\`\`\`

### 📝 Task List
- [x] Create React app scaffold
- [x] Design multi-theme system
- [x] Integrate Mermaid.js
- [x] Add clipboard and drag-drop image embeds
- [x] Deploy to Cloudflare Pages!

`;

interface MarkdownFile {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  // False/undefined = title tracks the first line of content automatically.
  // True once the user explicitly renames the file, which locks it.
  titleIsCustom?: boolean;
  // Soft-delete tombstone: kept (not spliced out) so a delete can propagate
  // to other synced devices instead of silently resurrecting on next sync.
  deleted?: boolean;
}

// Used for files whose title hasn't been manually set: mirrors the first
// non-empty line of the document, stripped of heading/list/quote markers.
const deriveTitleFromContent = (content: string): string => {
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) || '';
  const cleaned = firstLine.replace(/^#{1,6}\s+/, '').replace(/^[-*>]\s+/, '').trim();
  if (!cleaned) return 'Untitled.md';
  const truncated = cleaned.length > 50 ? `${cleaned.slice(0, 50).trimEnd()}…` : cleaned;
  return `${truncated}.md`;
};

// Reconciles the sync server's authoritative (already last-write-wins merged)
// note list into local files: newer remote revisions overwrite local ones,
// brand new remote notes get added, and each file's local-only titleIsCustom
// flag (never sent to the server) is preserved.
const applyServerNotes = (localFiles: MarkdownFile[], serverNotes: SyncNote[]): MarkdownFile[] => {
  const byId = new Map(localFiles.map((f) => [f.id, f]));
  for (const remote of serverNotes) {
    const local = byId.get(remote.id);
    if (!local || remote.updatedAt > local.updatedAt) {
      byId.set(remote.id, {
        id: remote.id,
        title: remote.title,
        content: remote.content,
        updatedAt: remote.updatedAt,
        deleted: remote.deleted,
        titleIsCustom: local?.titleIsCustom
      });
    }
  }
  return Array.from(byId.values());
};

// A note's title follows its first line unless the user renamed it. Notes that
// arrive from the sync server (or legacy data) have no `titleIsCustom` flag, so
// treat them as auto-titled when the title is the placeholder or matches what
// auto-titling would have produced for the current content.
const isAutoTitled = (f: MarkdownFile): boolean => {
  if (f.titleIsCustom === false) return true;
  if (f.titleIsCustom === true) return false;
  return f.title === 'Untitled.md' || f.title === deriveTitleFromContent(f.content);
};

// Below md the split view does not fit; it falls back to the editor.
const isNarrowViewport = () => window.innerWidth < 768;

// Persists the split sizes through the guarded storage helpers.
const layoutStorage = {
  getItem: (key: string) => safeGetItem(key),
  setItem: (key: string, value: string) => {
    safeSetItem(key, value);
  },
};

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

function App() {
  const [files, setFiles] = useState<MarkdownFile[]>(() => {
    const saved = safeGetItem('markdown-files');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error("Error parsing files", e);
      }
    }
    // Fallback: create default sample file
    const defaultFile: MarkdownFile = {
      id: 'default',
      title: 'Showcase.md',
      content: SAMPLE_MARKDOWN,
      updatedAt: Date.now()
    };
    // Migrate legacy content if it exists
    const legacyContent = safeGetItem('markdown-content');
    if (legacyContent && legacyContent !== SAMPLE_MARKDOWN) {
      const migratedFile: MarkdownFile = {
        id: 'migrated',
        title: 'Draft.md',
        content: legacyContent,
        updatedAt: Date.now()
      };
      return [migratedFile, defaultFile];
    }
    return [defaultFile];
  });

  const [activeFileId, setActiveFileId] = useState<string>(() => {
    const savedActive = safeGetItem('active-file-id');
    if (savedActive && files.some(f => f.id === savedActive && !f.deleted)) {
      return savedActive;
    }
    return (files.find(f => !f.deleted) ?? files[0])?.id || 'default';
  });

  const storageWriteFailed = useSyncExternalStore(subscribeStorageStatus, getStorageWriteFailed);
  const isMobile = useIsMobile();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  // Desktop file list open/closed (the phone Sheet has its own state inside SidebarProvider).
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => safeGetItem('sidebar-open') !== 'false');
  useEffect(() => {
    safeSetItem('sidebar-open', String(isSidebarOpen));
  }, [isSidebarOpen]);

  const [activeTab, setActiveTab] = useState<ViewMode>(() => {
    const saved = safeGetItem('active-tab') as ViewMode;
    if (['editor', 'preview', 'split'].includes(saved)) {
      if (isNarrowViewport() && saved === 'split') {
        return 'editor';
      }
      return saved;
    }
    return isNarrowViewport() ? 'editor' : 'split';
  });

  const [isSyncScrollEnabled, setIsSyncScrollEnabled] = useState(true);

  useEffect(() => {
    safeSetItem('active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleResize = () => {
      if (isNarrowViewport() && activeTab === 'split') {
        setActiveTab('editor');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

  const splitLayout = useDefaultLayout({ id: 'mdpreview.split-layout', storage: layoutStorage });

  // Preview / PDF custom settings
  const [fontFamily, setFontFamily] = useState(() => safeGetItem('preview-font-family') || "'Inter', system-ui, sans-serif");
  const [fontSize, setFontSize] = useState(() => safeGetItem('preview-font-size') || "1rem");
  const [lineHeight, setLineHeight] = useState(() => safeGetItem('preview-line-height') || "1.7");
  const [margin, setMargin] = useState(() => safeGetItem('preview-margin') || "1.5rem");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Sync settings to localStorage
  useEffect(() => {
    safeSetItem('preview-font-family', fontFamily);
  }, [fontFamily]);
  useEffect(() => {
    safeSetItem('preview-font-size', fontSize);
  }, [fontSize]);
  useEffect(() => {
    safeSetItem('preview-line-height', lineHeight);
  }, [lineHeight]);
  useEffect(() => {
    safeSetItem('preview-margin', margin);
  }, [margin]);

  const previewSettings: PreviewSettings = useMemo(
    () => ({ fontFamily, fontSize, lineHeight, margin }),
    [fontFamily, fontSize, lineHeight, margin]
  );
  const updatePreviewSettings = (patch: Partial<PreviewSettings>) => {
    if (patch.fontFamily !== undefined) setFontFamily(patch.fontFamily);
    if (patch.fontSize !== undefined) setFontSize(patch.fontSize);
    if (patch.lineHeight !== undefined) setLineHeight(patch.lineHeight);
    if (patch.margin !== undefined) setMargin(patch.margin);
  };

  // Device Sync (local sync server)
  const [syncEnabled, setSyncEnabled] = useState(() => safeGetItem('sync-enabled') === 'true');
  const [syncServerUrl, setSyncServerUrl] = useState(() => safeGetItem('sync-server-url') || '');
  const [syncApiKey, setSyncApiKey] = useState(() => safeGetItem('sync-api-key') || '');
  const [isSyncSettingsOpen, setIsSyncSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    safeSetItem('sync-enabled', String(syncEnabled));
  }, [syncEnabled]);
  useEffect(() => {
    safeSetItem('sync-server-url', syncServerUrl);
  }, [syncServerUrl]);
  useEffect(() => {
    safeSetItem('sync-api-key', syncApiKey);
  }, [syncApiKey]);

  // Always-current snapshot of files for the sync loop to read, so the
  // periodic interval/focus listener don't need `files` as a dependency
  // (which would tear down and recreate the timer on every keystroke).
  const filesRef = useRef<MarkdownFile[]>(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const syncInFlightRef = useRef(false);

  const runSync = useCallback(async () => {
    const url = syncServerUrl.trim();
    if (!syncEnabled || !url) return;
    // In-flight guard: interval, window focus and the debounce can all fire
    // runSync; never run overlapping requests.
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const payload: SyncNote[] = filesRef.current.map((f) => ({
        id: f.id,
        title: f.title,
        content: f.content,
        updatedAt: f.updatedAt,
        deleted: f.deleted === true
      }));
      const serverNotes = await syncNotes(url, payload, syncApiKey);
      // Apply with a functional update so edits typed while the request was in
      // flight are merged with, rather than overwritten by, a stale snapshot.
      // applyServerNotes reuses object references for unchanged notes; return
      // `prev` untouched when nothing changed so no-op sync ticks don't
      // re-render the app (which would disturb preview text selection).
      setFiles((prev) => {
        const merged = applyServerNotes(prev, serverNotes);
        const unchanged = merged.length === prev.length && merged.every((f, i) => f === prev[i]);
        return unchanged ? prev : merged;
      });
      // No active-id fix-up needed: `activeFile` below falls back to the first
      // visible note when the stored id points at a deleted/missing one.
      setSyncStatus('success');
      setLastSyncedAt(Date.now());
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      syncInFlightRef.current = false;
    }
  }, [syncEnabled, syncServerUrl, syncApiKey]);

  // Periodic sync + sync when the tab regains focus (e.g. switching back
  // from another device's edits taking effect while this one was idle).
  useEffect(() => {
    if (!syncEnabled || !syncServerUrl.trim()) return;
    // Deferred via setTimeout(0): runSync's first line is a setState call,
    // and calling that synchronously inside the effect body (rather than
    // from a callback/timer) trips react-hooks/set-state-in-effect.
    const kickoff = setTimeout(runSync, 0);
    const interval = setInterval(runSync, 15000);
    window.addEventListener('focus', runSync);
    return () => {
      clearTimeout(kickoff);
      clearInterval(interval);
      window.removeEventListener('focus', runSync);
    };
  }, [syncEnabled, syncServerUrl, runSync]);

  // Push local edits shortly after the user stops typing, instead of only on
  // the next periodic tick.
  useEffect(() => {
    if (!syncEnabled || !syncServerUrl.trim()) return;
    const timeout = setTimeout(runSync, 3000);
    return () => clearTimeout(timeout);
  }, [files, syncEnabled, syncServerUrl, runSync]);

  const syncConfigured = syncEnabled && syncServerUrl.trim().length > 0;
  const syncIndicator: SyncIndicator = !syncConfigured
    ? 'off'
    : syncStatus === 'syncing'
      ? 'syncing'
      : syncStatus === 'error'
        ? 'error'
        : 'ok';
  const syncStatusText = (() => {
    if (!syncServerUrl.trim()) return 'Enter a server address to start syncing.';
    if (!syncEnabled) return 'Sync is off.';
    if (syncStatus === 'syncing') return 'Syncing…';
    if (syncStatus === 'error') return `Error: ${syncError ?? 'Sync failed.'}`;
    if (lastSyncedAt) return `Last synced ${relativeTime(lastSyncedAt)}.`;
    return 'Waiting for the first sync…';
  })();

  // Scroll Sync Refs
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync files and active file ID to local storage
  useEffect(() => {
    safeSetItem('markdown-files', JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    safeSetItem('active-file-id', activeFileId);
  }, [activeFileId]);

  const activeFile = files.find(f => f.id === activeFileId && !f.deleted)
    || files.find(f => !f.deleted)
    || files[0]
    || { id: '', title: '', content: '', updatedAt: 0 };
  const markdown = activeFile.content;

  const setMarkdown = (newContent: string) => {
    // Edit the note that is actually rendered (activeFile), not the raw id,
    // which may point at a deleted/missing note.
    const targetId = activeFile.id;
    setFiles(prev => prev.map(f => {
      if (f.id !== targetId) return f;
      if (!isAutoTitled(f)) {
        return { ...f, content: newContent, updatedAt: Date.now() };
      }
      return { ...f, content: newContent, title: deriveTitleFromContent(newContent), titleIsCustom: false, updatedAt: Date.now() };
    }));
  };

  // Synchronized Scrolling Logic
  useEffect(() => {
    const editor = textareaRef.current;
    const preview = previewContainerRef.current;
    if (!editor || !preview || !isSyncScrollEnabled || activeTab !== 'split') return;

    let isScrollingEditor = false;
    let isScrollingPreview = false;

    const handleEditorScroll = () => {
      if (isScrollingPreview) return;
      isScrollingEditor = true;

      const percentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
      preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);

      setTimeout(() => {
        isScrollingEditor = false;
      }, 50);
    };

    const handlePreviewScroll = () => {
      if (isScrollingEditor) return;
      isScrollingPreview = true;

      const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
      editor.scrollTop = percentage * (editor.scrollHeight - editor.clientHeight);

      // Force-update line numbers position
      const lineNumbers = editor.previousSibling as HTMLDivElement;
      if (lineNumbers && lineNumbers.classList.contains('line-numbers')) {
        lineNumbers.scrollTop = editor.scrollTop;
      }

      setTimeout(() => {
        isScrollingPreview = false;
      }, 50);
    };

    editor.addEventListener('scroll', handleEditorScroll);
    preview.addEventListener('scroll', handlePreviewScroll);

    return () => {
      editor.removeEventListener('scroll', handleEditorScroll);
      preview.removeEventListener('scroll', handlePreviewScroll);
    };
  }, [isSyncScrollEnabled, markdown, activeTab]);

  const handleCreateFile = () => {
    const newId = `file_${Date.now()}`;
    const newFile: MarkdownFile = {
      id: newId,
      title: 'Untitled.md',
      content: '# Untitled\n\nStart writing here...',
      updatedAt: Date.now(),
      titleIsCustom: false
    };
    setFiles(prev => [newFile, ...prev]);
    setActiveFileId(newId);
    setEditingFileId(newId);
  };

  const deleteFile = (id: string) => {
    const current = filesRef.current;
    if (!current.some(f => f.id === id && !f.deleted)) return;

    // Soft delete: keep a tombstone instead of splicing the record out, so
    // the deletion can propagate to other synced devices instead of the
    // file silently reappearing next time they sync (they'd otherwise see
    // it as "a note that exists elsewhere but not here" and pull it back).
    const remainingVisible = current.filter(f => f.id !== id && !f.deleted);
    const tombstoned = current.map(f => (f.id === id ? { ...f, deleted: true, updatedAt: Date.now() } : f));

    if (remainingVisible.length === 0) {
      const fallbackFile: MarkdownFile = {
        id: `file_${Date.now()}`,
        title: 'Showcase.md',
        content: SAMPLE_MARKDOWN,
        updatedAt: Date.now()
      };
      setFiles([...tombstoned, fallbackFile]);
      setActiveFileId(fallbackFile.id);
    } else {
      setFiles(tombstoned);
      if (activeFile.id === id) {
        setActiveFileId(remainingVisible[0].id);
      }
    }
    if (editingFileId === id) {
      setEditingFileId(null);
    }
  };

  const handleRequestDelete = (id: string) => {
    const file = files.find(f => f.id === id && !f.deleted);
    if (!file) return;
    setConfirm({
      title: 'Delete this file?',
      description: `"${file.title}" will be deleted on this device and on every synced device.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => deleteFile(id),
    });
  };

  const handleSaveRename = (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      setEditingFileId(null);
      return;
    }
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      // The rename field auto-focuses right after "New file", so a blur with
      // no actual edit (e.g. the user just clicks into the editor to start
      // typing) must not lock the title — that would permanently disable
      // auto-titling from the first line for every newly created file.
      if (trimmed === f.title) return f;
      return { ...f, title: trimmed, titleIsCustom: true, updatedAt: Date.now() };
    }));
    setEditingFileId(null);
  };

  const handleClear = () => {
    setConfirm({
      title: 'Clear the editor?',
      description: 'This removes all text from the current file.',
      confirmLabel: 'Clear',
      destructive: true,
      onConfirm: () => setMarkdown(''),
    });
  };

  const handleLoadSample = () => {
    setConfirm({
      title: 'Load the sample document?',
      description: 'The sample template replaces the text of the current file.',
      confirmLabel: 'Load sample',
      onConfirm: () => setMarkdown(SAMPLE_MARKDOWN),
    });
  };

  // Close any open menu/sheet/dialog and wait for its portal content to unmount,
  // so it can't be captured in the printed page.
  const dismissFloatingLayers = async () => {
    const selector =
      '[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="tooltip"]';
    if (document.querySelector(selector)) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const deadline = performance.now() + 400;
    while (document.querySelector(selector) && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const triggerPrint = async () => {
    // Custom web fonts (Inter, Fira Code) load asynchronously; printing before
    // they're ready causes the browser to fall back to a substitute font that
    // can be missing glyphs (e.g. arrows) for the moment the PDF is captured.
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1000))
      ]);
    } catch {
      // Ignore font-loading errors and print with whatever is available.
    }
    await dismissFloatingLayers();
    window.print();
  };

  const filteredFiles = files
    .filter(f => !f.deleted && f.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="print-flow [--header-height:--spacing(14)]">
      <SidebarProvider open={isSidebarOpen} onOpenChange={setIsSidebarOpen} className="print-flow h-dvh min-h-0 flex-col overflow-hidden print:h-auto">
        <TopBar
          isMobile={isMobile}
          view={activeTab}
          onViewChange={setActiveTab}
          sync={syncIndicator}
          syncDetail={syncStatusText}
          onOpenSync={() => setIsSyncSettingsOpen(true)}
          syncScroll={isSyncScrollEnabled}
          onSyncScrollChange={setIsSyncScrollEnabled}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onExport={triggerPrint}
        />
        <div className="print-flow flex min-h-0 flex-1">
          <MobileAwareSidebar
            files={filteredFiles}
            activeId={activeFile.id}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelect={setActiveFileId}
            onCreate={handleCreateFile}
            onRequestDelete={handleRequestDelete}
            editingId={editingFileId}
            onStartRename={setEditingFileId}
            onRename={handleSaveRename}
            onCancelRename={() => setEditingFileId(null)}
          />
          <SidebarInset className="print-flow min-h-0 min-w-0 overflow-hidden bg-card md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:shadow-xs">
            {storageWriteFailed && (
              <div className="no-print border-b p-3">
                <Alert variant="destructive">
                  <WarningIcon />
                  <AlertTitle>Changes are not being saved</AlertTitle>
                  <AlertDescription>
                    Browser storage is full, so your latest changes are not saved locally. Delete large notes or pasted images to free space.
                  </AlertDescription>
                </Alert>
              </div>
            )}
            {/* Both panes stay mounted at all times (visibility is CSS-only, screen-scoped).
                Exporting to PDF always prints the preview regardless of which view is
                active on screen, and Mermaid diagrams stay pre-rendered instead of
                re-rendering every time the user switches views. A hidden panel leaves the
                other one alone in the flex row, so it fills the surface without touching
                the saved split sizes. */}
            <ResizablePanelGroup
              orientation="horizontal"
              id="mdpreview-split"
              defaultLayout={splitLayout.defaultLayout}
              onLayoutChanged={splitLayout.onLayoutChanged}
              className="print-flow min-h-0 flex-1"
            >
              <ResizablePanel id="editor" minSize="20%" className={cn('no-print', activeTab === 'preview' && 'pane-hidden')}>
                <Editor
                  value={markdown}
                  onChange={setMarkdown}
                  onClear={handleClear}
                  onLoadSample={handleLoadSample}
                  textareaRef={textareaRef}
                />
              </ResizablePanel>
              <ResizableHandle withHandle className={cn('no-print', activeTab !== 'split' && 'pane-hidden')} />
              <ResizablePanel id="preview" minSize="20%" className={cn('print-flow', activeTab === 'editor' && 'pane-hidden')}>
                <Preview
                  markdown={markdown}
                  previewContainerRef={previewContainerRef}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  margin={margin}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </SidebarInset>
        </div>
      </SidebarProvider>

      <PreviewSettingsSheet
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        settings={previewSettings}
        onChange={updatePreviewSettings}
      />
      <SyncSettingsSheet
        open={isSyncSettingsOpen}
        onOpenChange={setIsSyncSettingsOpen}
        enabled={syncEnabled}
        onEnabledChange={setSyncEnabled}
        serverUrl={syncServerUrl}
        onServerUrlChange={setSyncServerUrl}
        apiKey={syncApiKey}
        onApiKeyChange={setSyncApiKey}
        onSyncNow={runSync}
        syncing={syncStatus === 'syncing'}
        statusText={syncStatusText}
        statusTone={syncConfigured && syncStatus === 'error' ? 'error' : 'muted'}
      />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
      <Toaster position="bottom-center" />
    </div>
  );
}

// On phones the file list is a Sheet: picking or creating a file closes it.
function MobileAwareSidebar(props: ComponentProps<typeof FileSidebar>) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <FileSidebar
      {...props}
      onSelect={(id) => {
        props.onSelect(id);
        if (isMobile) setOpenMobile(false);
      }}
      onCreate={() => {
        props.onCreate();
        if (isMobile) setOpenMobile(false);
      }}
    />
  );
}

export default App;
