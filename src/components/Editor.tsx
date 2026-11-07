import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, Italic, Code, Link, Table, Image, Heading1, Heading2,
  Heading3, Activity, Trash2, BookOpen, Search, X, ChevronUp,
  ChevronDown, CaseSensitive, Replace, ReplaceAll
} from 'lucide-react';
import './MarkdownViewer.css';

interface EditorProps {
  value: string;
  onChange: (val: string) => void;
  onClear: () => void;
  onLoadSample: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  hidden?: boolean;
}

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
  const findInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Find & Replace
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const matches = useMemo(() => findAllMatches(value, findQuery, caseSensitive), [value, findQuery, caseSensitive]);
  const displayPosition = matches.length === 0
    ? 0
    : (currentMatchIndex >= 0 && currentMatchIndex < matches.length ? currentMatchIndex + 1 : 1);

  // Compute line numbers
  const lines = value.split('\n');
  const lineCount = Math.max(lines.length, 1);

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
    const targetScrollTop = paddingTop + lineNumber * lineHeight - textarea.clientHeight / 2 + lineHeight / 2;
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
    const confirmed = window.confirm(
      `Replace all ${matches.length} occurrence(s) of "${findQuery}" with "${replaceQuery}"?`
    );
    if (!confirmed) return;

    let newValue = '';
    let cursor = 0;
    for (const m of matches) {
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
      if (e.key === 'Escape') {
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
      alert('Only images can be embedded directly.');
      return;
    }
    try {
      const urls = await Promise.all(images.map(readAsDataUrl));
      const markdown = images.map((file, i) => `\n![${file.name}](${urls[i]})\n`).join('');
      insertText(markdown);
    } catch (err) {
      console.error('Failed to read image', err);
      alert('Could not read one of the images.');
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

  return (
    <div className={`editor-pane${hidden ? ' pane-hidden' : ''}`} style={{ flex: 1 }} onKeyDown={handleEditorPaneKeyDown}>
      <div className="pane-header no-print">
        <span>Editor</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="action-btn-secondary" onClick={openFind} title="Find & Replace (Ctrl/Cmd+F)" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
            <Search size={14} /> Find
          </button>
          <button className="action-btn-secondary" onClick={onLoadSample} title="Load sample markdown" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
            <BookOpen size={14} /> Sample
          </button>
          <button className="action-btn-secondary" onClick={onClear} title="Clear all text" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#ef4444' }}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Markdown Toolbar */}
      <div className="toolbar no-print">
        <button className="toolbar-btn" onClick={() => handleHeading(1)} title="Heading 1"><Heading1 size={16} /></button>
        <button className="toolbar-btn" onClick={() => handleHeading(2)} title="Heading 2"><Heading2 size={16} /></button>
        <button className="toolbar-btn" onClick={() => handleHeading(3)} title="Heading 3"><Heading3 size={16} /></button>
        <div className="toolbar-separator"></div>
        <button className="toolbar-btn" onClick={handleBold} title="Bold"><Bold size={16} /></button>
        <button className="toolbar-btn" onClick={handleItalic} title="Italic"><Italic size={16} /></button>
        <button className="toolbar-btn" onClick={handleCode} title="Inline Code"><Code size={16} /></button>
        <button className="toolbar-btn" onClick={handleCodeBlock} title="Code Block"><Code size={16} style={{ transform: 'rotate(90deg)' }} /></button>
        <div className="toolbar-separator"></div>
        <button className="toolbar-btn" onClick={handleLink} title="Add Link"><Link size={16} /></button>
        <button className="toolbar-btn" onClick={handleTable} title="Add Table"><Table size={16} /></button>
        <button className="toolbar-btn" onClick={handleImage} title="Embed Image"><Image size={16} /></button>
        <button className="toolbar-btn" onClick={handleMermaid} title="Add Mermaid Diagram"><Activity size={16} /></button>
      </div>

      {/* Find & Replace Bar */}
      {isFindOpen && (
        <div className="find-replace-bar no-print">
          <div className="find-replace-row">
            <Search size={14} className="find-replace-icon" />
            <input
              ref={findInputRef}
              type="text"
              className="find-replace-input"
              placeholder="Find"
              value={findQuery}
              onChange={(e) => handleFindQueryChange(e.target.value)}
              onKeyDown={handleFindInputKeyDown}
            />
            {findQuery && (
              <span className="find-replace-counter">
                {matches.length === 0 ? 'No results' : `${displayPosition}/${matches.length}`}
              </span>
            )}
            <button className="find-replace-icon-btn" onClick={handleFindPrevious} disabled={matches.length === 0} title="Previous (Shift+Enter)">
              <ChevronUp size={14} />
            </button>
            <button className="find-replace-icon-btn" onClick={handleFindNext} disabled={matches.length === 0} title="Next (Enter)">
              <ChevronDown size={14} />
            </button>
            <button
              className={`find-replace-icon-btn ${caseSensitive ? 'active' : ''}`}
              onClick={handleToggleCaseSensitive}
              title="Match case"
            >
              <CaseSensitive size={14} />
            </button>
            <button className="find-replace-icon-btn" onClick={closeFind} title="Close (Esc)">
              <X size={14} />
            </button>
          </div>
          <div className="find-replace-row">
            <Replace size={14} className="find-replace-icon" />
            <input
              type="text"
              className="find-replace-input"
              placeholder="Replace"
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
              onKeyDown={handleReplaceInputKeyDown}
            />
            <button className="find-replace-text-btn" onClick={handleReplace} disabled={matches.length === 0}>
              Replace
            </button>
            <button className="find-replace-text-btn" onClick={handleReplaceAll} disabled={matches.length === 0}>
              <ReplaceAll size={14} /> Replace All
            </button>
          </div>
        </div>
      )}

      {/* Editor Main Area */}
      <div 
        className="editor-container"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="dropzone-overlay">
            <Image size={48} className="animate-bounce" />
            <div className="dropzone-text">Solte a imagem aqui para incorporá-la</div>
          </div>
        )}

        <div className="editor-textarea-wrapper">
          {/* Synchronized Line Numbers */}
          <div className="line-numbers no-print" ref={lineNumbersRef}>
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            className="editor-textarea"
            placeholder="Type your markdown here... drag-and-drop/paste images, or insert a Mermaid graph!"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onPaste={handlePaste}
          />
        </div>
      </div>
    </div>
  );
};
