import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import {
  FileText, Download, Moon, Sun, Link2, Link2Off, Settings,
  Plus, Trash2, Edit2, Search, Menu, X, Cloud, CloudOff, RefreshCw
} from 'lucide-react';
import { syncNotes, type SyncNote } from './lib/sync';
import { safeGetItem, safeSetItem, subscribeStorageStatus, getStorageWriteFailed } from './lib/storage';
import './components/MarkdownViewer.css';

const SAMPLE_MARKDOWN = `# Markdown Previewer Showcase 🚀

Welcome! This is a complete, feature-rich markdown editor and live rendering preview application.

Created by [Henrique Silva](https://hfps.dev) using React and Vite.

---

## 🎨 Rich Features
- **Split-Pane Layout** with synchronized scrolling & mobile responsiveness.
- **Multiple Themes**: Quick toggle between Light (default), Dark, Sepia, and Cyberpunk.
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
    B -->|Light| C[Clean White]
    B -->|Dark| D[Elegant Dark]
    B -->|Sepia| E[Warm Sepia]
    B -->|Cyberpunk| F[Neon Cyberpunk]
    C --> G[Export PDF]
    D --> G
    E --> G
    F --> G
\`\`\`

### 📝 Task List
- [x] Create React app scaffold
- [x] Design multi-theme system
- [x] Integrate Mermaid.js
- [x] Add clipboard and drag-drop image embeds
- [x] Deploy to Cloudflare Pages!

`;

type Theme = 'light' | 'dark' | 'sepia' | 'cyberpunk';

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

const formatRelativeTime = (timestamp: number): string => {
  const diffSec = Math.round((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  return `${diffHour}h ago`;
};

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
    if (savedActive && files.some(f => f.id === savedActive)) {
      return savedActive;
    }
    return files[0]?.id || 'default';
  });

  const storageWriteFailed = useSyncExternalStore(subscribeStorageStatus, getStorageWriteFailed);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return window.innerWidth > 768;
  });
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = safeGetItem('theme') as Theme;
    return ['light', 'dark', 'sepia', 'cyberpunk'].includes(saved) ? saved : 'light';
  });

  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'split'>(() => {
    const saved = safeGetItem('active-tab') as 'editor' | 'preview' | 'split';
    if (['editor', 'preview', 'split'].includes(saved)) {
      if (window.innerWidth <= 768 && saved === 'split') {
        return 'editor';
      }
      return saved;
    }
    return window.innerWidth <= 768 ? 'editor' : 'split';
  });

  const [isSyncScrollEnabled, setIsSyncScrollEnabled] = useState(true);

  useEffect(() => {
    safeSetItem('active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768 && activeTab === 'split') {
        setActiveTab('editor');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab]);

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

  // Device Sync (local sync server)
  const [syncEnabled, setSyncEnabled] = useState(() => safeGetItem('sync-enabled') === 'true');
  const [syncServerUrl, setSyncServerUrl] = useState(() => safeGetItem('sync-server-url') || '');
  const [syncApiKey, setSyncApiKey] = useState(() => safeGetItem('sync-api-key') || '');
  const [isSyncSettingsOpen, setIsSyncSettingsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
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

  const runSync = useCallback(async () => {
    const url = syncServerUrl.trim();
    if (!syncEnabled || !url) return;
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
      const merged = applyServerNotes(filesRef.current, serverNotes);
      // applyServerNotes reuses the same object reference for any note that
      // didn't actually change, but Array.from() always returns a brand new
      // array — so without this check, every sync tick (even a total no-op
      // one) would replace `files` wholesale and re-render the whole app,
      // which is enough to disturb an in-progress text selection in the
      // preview pane even though nothing on screen actually changed.
      const unchanged = merged.length === filesRef.current.length
        && merged.every((f, i) => f === filesRef.current[i]);
      if (!unchanged) {
        setFiles(merged);
        setActiveFileId((prevId) => {
          const stillValid = merged.find((f) => f.id === prevId && !f.deleted);
          if (stillValid) return prevId;
          const fallback = merged.find((f) => !f.deleted);
          return fallback ? fallback.id : prevId;
        });
      }
      setSyncStatus('success');
      setLastSyncedAt(Date.now());
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err instanceof Error ? err.message : 'Sync failed.');
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

  useEffect(() => {
    safeSetItem('theme', theme);
    // Apply theme class to document body
    document.body.className = `theme-${theme}`;
  }, [theme]);

  const activeFile = files.find(f => f.id === activeFileId && !f.deleted)
    || files.find(f => !f.deleted)
    || files[0]
    || { id: '', title: '', content: '', updatedAt: 0 };
  const markdown = activeFile.content;

  const setMarkdown = (newContent: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id !== activeFileId) return f;
      const shouldAutoTitle = f.titleIsCustom === false || f.title === 'Untitled.md';
      if (!shouldAutoTitle) {
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
    setEditingTitle('Untitled.md');
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleDeleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const fileToDelete = files.find(f => f.id === id && !f.deleted);
    if (!fileToDelete) return;
    if (!window.confirm(`Are you sure you want to delete "${fileToDelete.title}"?`)) return;

    // Soft delete: keep a tombstone instead of splicing the record out, so
    // the deletion can propagate to other synced devices instead of the
    // file silently reappearing next time they sync (they'd otherwise see
    // it as "a note that exists elsewhere but not here" and pull it back).
    const remainingVisible = files.filter(f => f.id !== id && !f.deleted);
    const tombstoned = files.map(f => (f.id === id ? { ...f, deleted: true, updatedAt: Date.now() } : f));

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
      if (activeFileId === id) {
        setActiveFileId(remainingVisible[0].id);
      }
    }
    if (editingFileId === id) {
      setEditingFileId(null);
    }
  };

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFileId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = (id: string) => {
    if (!editingTitle.trim()) {
      setEditingFileId(null);
      return;
    }
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      const trimmed = editingTitle.trim();
      // The rename field auto-focuses right after "New File", so a blur with
      // no actual edit (e.g. the user just clicks into the editor to start
      // typing) must not lock the title — that would permanently disable
      // auto-titling from the first line for every newly created file.
      if (trimmed === f.title) return f;
      return { ...f, title: trimmed, titleIsCustom: true, updatedAt: Date.now() };
    }));
    setEditingFileId(null);
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear the editor?')) {
      setMarkdown('');
    }
  };

  const handleLoadSample = () => {
    if (window.confirm('Do you want to reload the sample template? This will replace your current text.')) {
      setMarkdown(SAMPLE_MARKDOWN);
    }
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
    window.print();
  };

  const getThemeName = (t: Theme) => {
    switch (t) {
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      case 'sepia': return 'Sepia';
      case 'cyberpunk': return 'Cyberpunk';
    }
  };

  const filteredFiles = files
    .filter(f => !f.deleted && f.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {storageWriteFailed && (
        <div
          className="no-print"
          role="alert"
          style={{ padding: '6px 12px', background: '#fef3c7', color: '#92400e', fontSize: '0.85rem', borderBottom: '1px solid #f59e0b' }}
        >
          Browser storage is full, so your latest changes are not being saved locally. Delete large notes or pasted images to free space.
        </div>
      )}
      {/* App Header */}
      <header className="app-header no-print">
        <div className="brand-section">
          <button 
            className={`sidebar-toggle-btn ${isSidebarOpen ? 'active' : ''}`}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Fechar painel lateral" : "Abrir painel lateral"}
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="brand-logo">
            <img src="/logo.png" alt="MD Logo" style={{ width: '24px', height: '24px', borderRadius: '4px' }} />
          </div>
          <span className="brand-title">Markdown Previewer</span>
        </div>

        {/* View Mode Segmented Control */}
        <div className="view-mode-selector">
          <button
            className={activeTab === 'editor' ? 'active' : ''}
            onClick={() => setActiveTab('editor')}
            title="Mostrar apenas o Editor"
          >
            Editor
          </button>
          <button
            className={`desktop-only ${activeTab === 'split' ? 'active' : ''}`}
            onClick={() => setActiveTab('split')}
            title="Mostrar Split (Editor + Preview)"
          >
            Split
          </button>
          <button
            className={activeTab === 'preview' ? 'active' : ''}
            onClick={() => setActiveTab('preview')}
            title="Mostrar apenas o Preview"
          >
            Preview
          </button>
        </div>

        <div className="control-section">
          {/* Theme Selector Dropdown */}
          <div className="theme-selector">
            <button
              className="theme-btn"
              onClick={() => {
                setIsThemeDropdownOpen(!isThemeDropdownOpen);
                setIsSettingsOpen(false);
                setIsSyncSettingsOpen(false);
              }}
              title="Change theme"
            >
              {theme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
              <span>Theme: {getThemeName(theme)}</span>
            </button>

            {isThemeDropdownOpen && (
              <div className="theme-dropdown">
                {(['light', 'dark', 'sepia', 'cyberpunk'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    className={`theme-option ${theme === t ? 'active' : ''}`}
                    onClick={() => {
                      setTheme(t);
                      setIsThemeDropdownOpen(false);
                    }}
                  >
                    <span>{getThemeName(t)}</span>
                    <span
                      className="theme-color-dot"
                      style={{
                        backgroundColor:
                          t === 'light' ? '#ffffff' :
                            t === 'dark' ? '#0f172a' :
                              t === 'sepia' ? '#f4ecd8' : '#0a0a16',
                        borderColor: t === 'light' ? '#cbd5e1' : 'transparent'
                      }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings Menu Dropdown */}
          <div className="settings-menu">
            <button
              className={`theme-btn ${isSettingsOpen ? 'active' : ''}`}
              onClick={() => {
                setIsSettingsOpen(!isSettingsOpen);
                setIsThemeDropdownOpen(false);
                setIsSyncSettingsOpen(false);
              }}
              title="Preview / PDF Export Options"
            >
              <Settings size={16} />
              <span>Settings</span>
            </button>

            {isSettingsOpen && (
              <div className="settings-dropdown">
                <div className="settings-group">
                  <span className="settings-label">Font Family</span>
                  <select
                    className="settings-select"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                  >
                    <option value="'Inter', system-ui, sans-serif">Sans-Serif (Inter)</option>
                    <option value="Georgia, Cambria, 'Times New Roman', serif">Serif (Georgia)</option>
                    <option value="'Fira Code', Consolas, Monaco, monospace">Monospace (Fira Code)</option>
                  </select>
                </div>

                <div className="settings-group">
                  <span className="settings-label">Font Size</span>
                  <select
                    className="settings-select"
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                  >
                    <option value="0.875rem">Small (14px)</option>
                    <option value="1rem">Medium (16px)</option>
                    <option value="1.125rem">Large (18px)</option>
                    <option value="1.25rem">Extra Large (20px)</option>
                  </select>
                </div>

                <div className="settings-group">
                  <span className="settings-label">Line Spacing</span>
                  <select
                    className="settings-select"
                    value={lineHeight}
                    onChange={(e) => setLineHeight(e.target.value)}
                  >
                    <option value="1.3">Compact (1.3)</option>
                    <option value="1.7">Normal (1.7)</option>
                    <option value="2.2">Double (2.2)</option>
                  </select>
                </div>

                <div className="settings-group">
                  <span className="settings-label">PDF Margins</span>
                  <select
                    className="settings-select"
                    value={margin}
                    onChange={(e) => setMargin(e.target.value)}
                  >
                    <option value="0">None</option>
                    <option value="1rem">Compact (1rem)</option>
                    <option value="2rem">Standard (2rem)</option>
                    <option value="3.5rem">Wide (3.5rem)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Device Sync Menu Dropdown */}
          <div className="settings-menu">
            <button
              className={`theme-btn ${isSyncSettingsOpen ? 'active' : ''}`}
              onClick={() => {
                setIsSyncSettingsOpen(!isSyncSettingsOpen);
                setIsThemeDropdownOpen(false);
                setIsSettingsOpen(false);
              }}
              title="Device Sync Settings"
            >
              {syncEnabled ? <Cloud size={16} /> : <CloudOff size={16} />}
              <span>Sync</span>
            </button>

            {isSyncSettingsOpen && (
              <div className="settings-dropdown">
                <div className="settings-group">
                  <button
                    className={`action-btn-secondary sync-toggle-btn ${syncEnabled ? 'active' : ''}`}
                    onClick={() => setSyncEnabled(!syncEnabled)}
                    style={{
                      borderColor: syncEnabled ? 'var(--accent)' : 'var(--border-color)',
                      color: syncEnabled ? 'var(--accent)' : 'var(--text-secondary)',
                      backgroundColor: syncEnabled ? 'var(--accent-light)' : 'var(--bg-primary)'
                    }}
                  >
                    {syncEnabled ? <Cloud size={16} /> : <CloudOff size={16} />}
                    <span>{syncEnabled ? 'Device sync enabled' : 'Enable device sync'}</span>
                  </button>
                </div>

                <div className="settings-group">
                  <span className="settings-label">Sync Server Address</span>
                  <input
                    key={isSyncSettingsOpen ? 'open' : 'closed'}
                    type="text"
                    className="settings-select"
                    placeholder="http://192.168.1.xx:3041"
                    defaultValue={syncServerUrl}
                    onBlur={(e) => setSyncServerUrl(e.target.value.trim())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                </div>

                <div className="settings-group">
                  <span className="settings-label">API Key (only if your server requires one)</span>
                  <input
                    key={isSyncSettingsOpen ? 'open-key' : 'closed-key'}
                    type="password"
                    className="settings-select"
                    placeholder="Leave empty for a plain LAN-only server"
                    defaultValue={syncApiKey}
                    onBlur={(e) => setSyncApiKey(e.target.value.trim())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                </div>

                <div className="settings-group">
                  <button
                    className="action-btn-secondary"
                    onClick={runSync}
                    disabled={!syncEnabled || !syncServerUrl.trim() || syncStatus === 'syncing'}
                  >
                    <RefreshCw size={14} className={syncStatus === 'syncing' ? 'spin' : ''} />
                    <span>Sync Now</span>
                  </button>
                  <span className="settings-label" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                    {syncStatus === 'syncing' && 'Syncing…'}
                    {syncStatus === 'success' && lastSyncedAt && `Last synced ${formatRelativeTime(lastSyncedAt)}`}
                    {syncStatus === 'error' && syncError && `Error: ${syncError}`}
                    {syncStatus === 'idle' && !syncServerUrl.trim() && 'Enter a server address to start syncing.'}
                    {syncStatus === 'idle' && syncServerUrl.trim() && !syncEnabled && 'Sync is off.'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sync Scroll Toggle Button */}
          {activeTab === 'split' && (
            <button
              className={`action-btn-secondary ${isSyncScrollEnabled ? 'active' : ''}`}
              onClick={() => setIsSyncScrollEnabled(!isSyncScrollEnabled)}
              title={isSyncScrollEnabled ? "Desativar Scroll Sincronizado" : "Ativar Scroll Sincronizado"}
              style={{
                borderColor: isSyncScrollEnabled ? 'var(--accent)' : 'var(--border-color)',
                color: isSyncScrollEnabled ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: isSyncScrollEnabled ? 'var(--accent-light)' : 'var(--bg-primary)'
              }}
            >
              {isSyncScrollEnabled ? <Link2 size={16} /> : <Link2Off size={16} />}
              <span>Sync Scroll</span>
            </button>
          )}

          {/* Export PDF Button */}
          <button
            className="action-btn"
            onClick={triggerPrint}
            title="Export compiled PDF / Print"
          >
            <Download size={16} />
            <span>Export PDF</span>
          </button>
        </div>
      </header>

      <div className="main-content-layout">
        {/* Sidebar */}
        <aside className="sidebar no-print">
          <div className="sidebar-header">
            <button className="new-file-btn" onClick={handleCreateFile}>
              <Plus size={16} />
              <span>New File</span>
            </button>
          </div>

          <div className="sidebar-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Pesquisar arquivos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')} title="Limpar pesquisa">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="file-list">
            {filteredFiles.map((file) => {
              const isActive = file.id === activeFileId;
              const isEditing = file.id === editingFileId;

              return (
                <div
                  key={file.id}
                  className={`file-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFileId(file.id);
                    if (window.innerWidth <= 768) {
                      setIsSidebarOpen(false);
                    }
                  }}
                >
                  <FileText size={16} className="file-icon" />
                  {isEditing ? (
                    <input
                      type="text"
                      className="file-rename-input"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveRename(file.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(file.id);
                        if (e.key === 'Escape') setEditingFileId(null);
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="file-title">{file.title}</span>
                  )}
                  <div className="file-actions">
                    {!isEditing && (
                      <button
                        className="file-action-btn"
                        onClick={(e) => handleStartRename(file.id, file.title, e)}
                        title="Renomear"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                    <button
                      className="file-action-btn delete"
                      onClick={(e) => handleDeleteFile(file.id, e)}
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredFiles.length === 0 && (
              <div className="empty-search">Nenhum arquivo encontrado</div>
            )}
          </div>
        </aside>

        {/* Editor & Previewer Workspace */}
        <main className="workspace">
          {/* Both panes stay mounted at all times (visibility is CSS-only, screen-scoped).
              Exporting to PDF always prints the preview regardless of which tab is
              active on screen, and Mermaid diagrams stay pre-rendered instead of
              re-rendering every time the user switches tabs. */}
          <Editor
            value={markdown}
            onChange={setMarkdown}
            onClear={handleClear}
            onLoadSample={handleLoadSample}
            textareaRef={textareaRef}
            hidden={activeTab === 'preview'}
          />

          {activeTab === 'split' && <div className="resizer no-print" />}

          <Preview
            markdown={markdown}
            previewContainerRef={previewContainerRef}
            fontFamily={fontFamily}
            fontSize={fontSize}
            lineHeight={lineHeight}
            margin={margin}
            hidden={activeTab === 'editor'}
          />
        </main>
      </div>
    </div>
  );
}

export default App;

