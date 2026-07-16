import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif'
});

interface MermaidRendererProps {
  chart: string;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const elementId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

    const renderChart = async () => {
      if (!containerRef.current) return;
      
      try {
        setError(null);
        // Clean up chart text (remove extra spaces or newlines that cause parse errors)
        const cleanChart = chart.trim();
        
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
  }, [chart]);

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
