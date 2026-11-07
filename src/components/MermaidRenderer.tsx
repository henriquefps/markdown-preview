import React, { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';

type MermaidTheme = 'default' | 'dark';

// 'strict' keeps mermaid from emitting scripts/unsafe HTML: notes can arrive
// from the sync server, and the SVG is injected with dangerouslySetInnerHTML.
const initMermaid = (theme: MermaidTheme) => {
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'strict',
    fontFamily: 'Inter, system-ui, sans-serif'
  });
};

const readAppTheme = (): MermaidTheme => {
  const cls = document.body.classList;
  return cls.contains('theme-dark') || cls.contains('theme-cyberpunk') ? 'dark' : 'default';
};

// Tracks the app theme (body class `theme-*`) so diagrams re-render on change.
const useMermaidTheme = (): MermaidTheme => {
  const [theme, setTheme] = useState<MermaidTheme>(readAppTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readAppTheme()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return theme;
};

let renderCounter = 0;

interface MermaidRendererProps {
  chart: string;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const theme = useMermaidTheme();
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  useEffect(() => {
    let isMounted = true;
    // useId is unique per component instance; the counter keeps successive
    // renders of the same instance from colliding either.
    const elementId = `mermaid-${baseId}-${renderCounter++}`;

    const renderChart = async () => {
      if (!containerRef.current) return;
      
      try {
        setError(null);
        // Clean up chart text (remove extra spaces or newlines that cause parse errors)
        const cleanChart = chart.trim();
        
        initMermaid(theme);
        // Parse and render the chart
        const { svg: renderedSvg } = await mermaid.render(elementId, cleanChart);
        
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err: unknown) {
        console.error('Mermaid parsing error:', err);

        // Extract a clean message
        let errMsg = 'Failed to render Mermaid diagram.';
        if (err instanceof Error) {
          errMsg = err.message;
        } else if (typeof err === 'string') {
          errMsg = err;
        } else if (err && typeof err === 'object' && 'str' in err && typeof err.str === 'string') {
          errMsg = err.str;
        }
        
        if (isMounted) {
          setError(errMsg);
        }
        
        // Clear broken element from DOM if any was created and orphaned
        const orphaned = document.getElementById(elementId);
        if (orphaned) {
          orphaned.remove();
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, theme, baseId]);

  if (error) {
    return (
      <div className="mermaid-container no-print">
        <div className="mermaid-error">
          <strong>Mermaid Render Error:</strong>
          <pre style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="mermaid-container" 
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: svg || '<span class="no-print">Rendering diagram...</span>' }} 
    />
  );
};
