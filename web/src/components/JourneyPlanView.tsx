import { useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';

interface JourneyPlanViewProps {
  chart: string;
}

let mermaidInited = false;

function ensureMermaidInit() {
  if (mermaidInited) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
  });
  mermaidInited = true;
}

export default function JourneyPlanView({ chart }: JourneyPlanViewProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const safeChart = chart.trim();
  const renderId = useMemo(() => `journey-mermaid-${Math.random().toString(36).slice(2)}`, [safeChart]);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!safeChart) {
        setSvg('');
        setError('Journey plan 不能为空。');
        return;
      }
      try {
        ensureMermaidInit();
        const { svg: rendered } = await mermaid.render(renderId, safeChart);
        if (!cancelled) {
          setSvg(rendered);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setSvg('');
          setError(err instanceof Error ? err.message : 'Mermaid 渲染失败');
        }
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [renderId, safeChart]);

  if (error) {
    return (
      <div className="card" style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)' }}>
        <div className="card-body" style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>
          Mermaid 解析失败：{error}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body" style={{ overflowX: 'auto' }}>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}
