import React, { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import { usePalette, useResolvedTheme } from '@/lib/theme/theme';

type Mode = 'light' | 'dark';

// Converts any CSS color the browser understands (the theme tokens are oklch) into #rrggbb,
// which Mermaid's color library can parse.
let probe: CanvasRenderingContext2D | null = null;
const toHex = (cssColor: string, fallback: string): string => {
  try {
    probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!probe || !cssColor) return fallback;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = fallback;
    probe.fillStyle = cssColor;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return fallback;
  }
};

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Mermaid's built-in 'default' (light) and 'dark' themes, with the palette's primary as the
// accent for borders and lines. The print copy uses fixed light colors so PDFs stay clean.
const themeConfig = (mode: Mode, forPrint: boolean) => {
  if (forPrint) {
    return { theme: 'default' as const, themeVariables: { fontFamily: 'Inter, system-ui, sans-serif' } };
  }
  const primary = toHex(token('--primary'), mode === 'dark' ? '#9fb87a' : '#5b7a3a');
  return {
    theme: mode === 'dark' ? ('dark' as const) : ('default' as const),
    themeVariables: {
      fontFamily: 'Inter, system-ui, sans-serif',
      primaryBorderColor: primary,
      lineColor: primary,
    },
  };
};

let renderCounter = 0;

// Renders sequentially: mermaid.initialize is global, so two concurrent renders with
// different configs (screen + print copy) must not interleave.
let queue: Promise<unknown> = Promise.resolve();
const renderSvg = (chart: string, mode: Mode, forPrint: boolean, baseId: string): Promise<string> => {
  const run = async () => {
    const elementId = `mermaid-${baseId}-${renderCounter++}`;
    // Mermaid sizes node boxes from measured text: measuring before Inter has loaded clips labels.
    await Promise.race([document.fonts?.ready, new Promise((resolve) => setTimeout(resolve, 1500))]).catch(() => undefined);
    try {
      // 'strict' keeps mermaid from emitting scripts/unsafe HTML: notes can arrive from the
      // sync server, and the SVG is injected with dangerouslySetInnerHTML.
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...themeConfig(mode, forPrint) });
      const { svg } = await mermaid.render(elementId, chart);
      return svg;
    } finally {
      document.getElementById(elementId)?.remove();
      document.getElementById(`d${elementId}`)?.remove();
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
};

const errorText = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'str' in err && typeof err.str === 'string') return err.str;
  return 'Failed to render Mermaid diagram.';
};

interface MermaidRendererProps {
  chart: string;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart }) => {
  const mode = useResolvedTheme();
  const palette = usePalette();
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [state, setState] = useState<{ svg: string; printSvg: string | null; error: string | null }>({
    svg: '',
    printSvg: null,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    const cleanChart = chart.trim();
    (async () => {
      try {
        const svg = await renderSvg(cleanChart, mode, false, baseId);
        // In dark mode also render a light copy: print/PDF export always stays light.
        const printSvg = mode === 'dark' ? await renderSvg(cleanChart, 'light', true, baseId) : null;
        if (isMounted) setState({ svg, printSvg, error: null });
      } catch (err) {
        console.error('Mermaid parsing error:', err);
        if (isMounted) setState({ svg: '', printSvg: null, error: errorText(err) });
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [chart, mode, palette, baseId]);

  if (state.error) {
    return (
      <div className="mermaid-container no-print">
        <div className="mermaid-error" role="alert">
          <strong>Mermaid render error</strong>
          <pre>{state.error}</pre>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`mermaid-container mermaid-screen${state.printSvg ? ' mermaid-has-print' : ''}`}
        dangerouslySetInnerHTML={{ __html: state.svg || '<span class="no-print">Rendering diagram…</span>' }}
      />
      {state.printSvg && (
        <div className="mermaid-container mermaid-print" dangerouslySetInnerHTML={{ __html: state.printSvg }} />
      )}
    </>
  );
};
