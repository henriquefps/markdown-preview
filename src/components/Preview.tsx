import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { MermaidRenderer } from './MermaidRenderer';
import { Copy, Check } from 'lucide-react';

interface PreviewProps {
  markdown: string;
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  margin: string;
}

// Custom schema for rehype-sanitize to allow inline base64 images
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img || []), ['src', 'alt', 'title']]
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
  margin
}) => {
  // Custom code component to render Mermaid diagrams or standard code blocks
  const CodeBlockComponent = ({ node, className, children, ...props }: any) => {
    const isInline = !className || !className.startsWith('language-');

    if (isInline) {
      return <code className={className} {...props}>{children}</code>;
    }

    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');

    if (match && match[1] === 'mermaid') {
      return <MermaidRenderer chart={codeString} />;
    }

    // Standard Code Block component with Copy button
    return <CustomCodeBlock code={codeString} language={match ? match[1] : 'text'} {...props} />;
  };

  return (
    <div className="preview-pane" style={{ flex: 1 }}>
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
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
                    components={{
                      code: CodeBlockComponent
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
