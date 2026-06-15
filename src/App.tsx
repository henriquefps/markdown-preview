import { useState, useEffect, useRef } from 'react';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { FileText, Download, Moon, Sun, Link2, Link2Off, Settings } from 'lucide-react';
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
Defined Custom Styles --> G
\`\`\`

### 📝 Task List
- [x] Create React app scaffold
- [x] Design multi-theme system
- [x] Integrate Mermaid.js
- [x] Add clipboard and drag-drop image embeds
- [x] Deploy to Cloudflare Pages!

`;

type Theme = 'light' | 'dark' | 'sepia' | 'cyberpunk';

function App() {
  const [markdown, setMarkdown] = useState<string>(() => {
    const saved = localStorage.getItem('markdown-content');
    return saved !== null ? saved : SAMPLE_MARKDOWN;
  });

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme;
    return ['light', 'dark', 'sepia', 'cyberpunk'].includes(saved) ? saved : 'light';
  });

  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'split'>(() => {
    const saved = localStorage.getItem('active-tab') as 'editor' | 'preview' | 'split';
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
    localStorage.setItem('active-tab', activeTab);
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
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem('preview-font-family') || "'Inter', system-ui, sans-serif");
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('preview-font-size') || "1rem");
  const [lineHeight, setLineHeight] = useState(() => localStorage.getItem('preview-line-height') || "1.7");
  const [margin, setMargin] = useState(() => localStorage.getItem('preview-margin') || "1.5rem");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem('preview-font-family', fontFamily);
  }, [fontFamily]);
  useEffect(() => {
    localStorage.setItem('preview-font-size', fontSize);
  }, [fontSize]);
  useEffect(() => {
    localStorage.setItem('preview-line-height', lineHeight);
  }, [lineHeight]);
  useEffect(() => {
    localStorage.setItem('preview-margin', margin);
  }, [margin]);

  // Scroll Sync Refs
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('markdown-content', markdown);
  }, [markdown]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    // Apply theme class to document body
    document.body.className = `theme-${theme}`;
  }, [theme]);

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

  const triggerPrint = () => {
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

  return (
    <>
      {/* App Header */}
      <header className="app-header no-print">
        <div className="brand-section">
          <div className="brand-logo">
            <FileText size={24} />
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
              onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
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


      {/* Editor & Previewer Workspace */}
      <main className="workspace">
        {(activeTab === 'editor' || activeTab === 'split') && (
          <Editor
            value={markdown}
            onChange={setMarkdown}
            onClear={handleClear}
            onLoadSample={handleLoadSample}
            textareaRef={textareaRef}
          />
        )}

        {activeTab === 'split' && <div className="resizer no-print" />}

        {(activeTab === 'preview' || activeTab === 'split') && (
          <Preview
            markdown={markdown}
            previewContainerRef={previewContainerRef}
            fontFamily={fontFamily}
            fontSize={fontSize}
            lineHeight={lineHeight}
            margin={margin}
          />
        )}
      </main>
    </>
  );
}

export default App;
