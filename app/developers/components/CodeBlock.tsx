'use client';
import { useEffect, useRef, useState } from 'react';
import { copyText } from './clipboard';

/** Code sample with a header label and a copy button (clipboard API with a fallback). */
export default function CodeBlock({ code, title }: { code: string; title?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    const ok = await copyText(code);
    setState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  }

  return (
    <div className="dev-code">
      <div className="dev-code-head">
        <span>{title || 'code'}</span>
        <button type="button" className="dev-copy" data-state={state} onClick={copy} aria-live="polite">
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select & copy' : 'Copy'}
        </button>
      </div>
      <pre tabIndex={0}><code>{code}</code></pre>
    </div>
  );
}
