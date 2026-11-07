import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkEmoji from 'remark-emoji';
import remarkSupersub from 'remark-supersub';
import remarkFlexibleMarkers from 'remark-flexible-markers';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import { MermaidRenderer } from './MermaidRenderer';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

// react-markdown re-parses and rebuilds its whole element tree on every render,
// which is enough to disturb an in-progress text selection in the preview pane
// even when the output ends up identical. Preview is wrapped in React.memo below
// so it only actually re-renders when its own props change value — but that only
// helps if the plugin arrays/components below are stable references too, since
// otherwise they'd look like "new props" on every parent re-render regardless.
const remarkPluginsList: Options['remarkPlugins'] = [[remarkGfm, { singleTilde: false }], remarkMath, remarkEmoji, remarkSupersub, remarkFlexibleMarkers];
const rehypePluginsList: Options['rehypePlugins'] = [rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex];

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

const markdownComponents: Components = {
  code: CodeBlockComponent,
  pre: PreComponent,
  table: TableComponent
};

const PreviewComponent: React.FC<PreviewProps> = ({
  markdown,
  previewContainerRef,
  fontFamily,
  fontSize,
  lineHeight,
  margin,
  hidden
}) => {
  return (
    <section
      aria-label="Preview"
      className={cn('print-flow flex h-full min-h-0 min-w-0 flex-col', hidden && 'pane-hidden')}
    >
      <div
        className="print-flow min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8"
        ref={previewContainerRef}
        style={{
          '--preview-font-family': fontFamily,
          '--preview-font-size': fontSize,
          '--preview-line-height': lineHeight,
          '--preview-margin': margin
        } as React.CSSProperties}
      >
        <div className="markdown-body mx-auto max-w-3xl">
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
                    remarkPlugins={remarkPluginsList}
                    rehypePlugins={rehypePluginsList}
                    components={markdownComponents}
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
    </section>
  );
};

// Memoized so unrelated App-level state changes (sync status ticking, theme
// dropdown, etc.) don't force react-markdown to rebuild this whole tree and
// disturb an in-progress text selection when the actual preview props haven't
// changed.
export const Preview = React.memo(PreviewComponent);

// Code block with a copy button (screen only).
const CustomCodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      toast.error('Could not copy the code.');
    }
  };

  return (
    <div className="code-block-wrapper group/code">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={handleCopy}
        className="no-print absolute top-2 right-2 bg-card"
        aria-label={copied ? 'Copied' : 'Copy code'}
        title={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <CheckIcon className="text-primary" /> : <CopyIcon />}
      </Button>
      <pre>
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
};
