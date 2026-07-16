import React, { useRef, useState } from 'react';
import { 
  Bold, Italic, Code, Link, Table, Image, Heading1, Heading2, 
  Heading3, Activity, Trash2, BookOpen
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

export const Editor: React.FC<EditorProps> = ({ value, onChange, onClear, onLoadSample, textareaRef, hidden }) => {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Compute line numbers
  const lines = value.split('\n');
  const lineCount = Math.max(lines.length, 1);

  // Synchronize scrolling of line numbers and textarea
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
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

  // Handle Drag & Drop of Images
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Only images can be embedded directly.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const base64Url = event.target.result as string;
        insertText(`\n![${file.name}](`, ')\n', base64Url);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Handle Clipboard Paste
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      processFile(e.clipboardData.files[0]);
    }
  };

  return (
    <div className={`editor-pane${hidden ? ' pane-hidden' : ''}`} style={{ flex: 1 }}>
      <div className="pane-header no-print">
        <span>Editor</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
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

      {/* Editor Main Area */}
      <div 
        className="editor-container"
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
