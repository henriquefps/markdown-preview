import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import remarkSupersub from 'remark-supersub';
import remarkFlexibleMarkers from 'remark-flexible-markers';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import { MermaidRenderer } from './MermaidRenderer';
import { Copy, Check } from 'lucide-react';

interface PreviewProps {
  markdown: string;
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  margin: string;
  hidden?: boolean;
}

// Custom schema for rehype-sanitize to allow inline base64 images and the
// <mark> element (remark-flexible-markers' ==highlight== output isn't in the
// default GitHub-style allow-list, unlike <sup>/<sub> which already are)
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'mark'],
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img || []), ['src', 'alt', 'title']],
    mark: [...(defaultSchema.attributes?.mark || []), 'className']
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ['http', 'https', 'data'] // Allow data URIs for embedded images
  }
};

export const Preview: React.FC<PreviewProps> = ({
  markdown,
  previewContainerRef,
  fontFamily,
  fontSize,
  lineHeight,
  margin,
  hidden
}) => {
  // Custom code component to render Mermaid diagrams or standard code blocks.
  // react-markdown v9+ no longer passes an `inline` prop, so block-level fences
  // are distinguished from inline spans by whether the source node spans multiple
  // lines (a fence always does, even without a language tag).
  const CodeBlockComponent: Components['code'] = ({ node, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    const isMultiLine = node?.position && node.position.start.line !== node.position.end.line;
    const isInline = !isMultiLine && !match;

    if (isInline) {
      return <code className={className} {...props}>{children}</code>;
    }

    const codeString = String(children).replace(/\n$/, '');

    if (match && match[1] === 'mermaid') {
      return <MermaidRenderer chart={codeString} />;
    }

    // Standard Code Block component with Copy button
    return <CustomCodeBlock code={codeString} language={match ? match[1] : 'text'} />;
  };

  // react-markdown always wraps the `code` renderer's output in its own default
  // `<pre>`, which would nest our CustomCodeBlock's <pre> inside another <pre>
  // (invalid HTML, doubled padding/border). We take over that wrapping ourselves.
  const PreComponent: Components['pre'] = ({ children }) => <>{children}</>;

  // Wrap tables in a horizontally scrollable container so wide tables no longer
  // force the whole page/monitor to widen to be readable.
  const TableComponent: Components['table'] = ({ children, ...props }) => (
    <div className="table-wrapper">
      <table {...props}>{children}</table>
    </div>
  );

  return (
    <div className={`preview-pane${hidden ? ' pane-hidden' : ''}`} style={{ flex: 1 }}>
      <div className="pane-header no-print">
        <span>Preview</span>
      </div>
      <div
        className="preview-container"
        ref={previewContainerRef}
        style={{
          '--preview-font-family': fontFamily,
          '--preview-font-size': fontSize,
          '--preview-line-height': lineHeight,
          '--preview-margin': margin
        } as React.CSSProperties}
      >
        <div className="markdown-body">
          <table className="print-layout-table">
            <thead>
              <tr>
                <td><div className="print-margin-spacer"></div></td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <ReactMarkdown
                    remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMath, remarkEmoji, remarkSupersub, remarkFlexibleMarkers]}
                    rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex]}
                    components={{
                      code: CodeBlockComponent,
                      pre: PreComponent,
                      table: TableComponent
                    }}
                  >
                    {markdown}
                  </ReactMarkdown>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td><div className="print-margin-spacer"></div></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

// Custom component for copying code blocks
const CustomCodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div style={{ position: 'relative' }} className="code-block-wrapper">
      <button
        onClick={handleCopy}
        className="no-print"
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '0.25rem',
          padding: '0.25rem',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
          zIndex: 10
        }}
        title="Copy code"
      >
        {copied ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
      </button>
      <pre>
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
};
