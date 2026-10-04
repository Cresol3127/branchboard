import { useEffect, useRef, useState } from 'react';
import type { ProviderId } from '../providers';

export function ModelTest({
  provider,
  model,
  savedSettings,
  disabled,
}: {
  provider: ProviderId;
  model: string;
  savedSettings: string;
  disabled: boolean;
}) {
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    text?: string;
    error?: string;
    elapsedMs?: number;
  } | null>(null);
  useEffect(() => {
    setResult(null);
    setBusy(false);
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [provider, model, savedSettings, disabled]);
  const test = async () => {
    const request = new AbortController();
    controller.current = request;
    const timer = setTimeout(() => request.abort(), 35_000);
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/providers/${provider}/test-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: request.signal,
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Model test failed.');
      if (value.status !== 'passed' || typeof value.text !== 'string' || !value.text.trim())
        throw new Error('The provider did not confirm a text response.');
      if (controller.current === request)
        setResult({ text: value.text, elapsedMs: value.elapsedMs });
    } catch (error) {
      if (controller.current === request)
        setResult({
          error: request.signal.aborted
            ? 'Test cancelled or timed out. Provider charges may still apply.'
            : error instanceof Error
              ? error.message
              : 'Model test failed.',
        });
    } finally {
      clearTimeout(timer);
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <section className="model-test" aria-label="Test model">
      <h3>Test this model</h3>
      <p className="muted">
        Sends one tiny, output-limited request using the saved provider settings. No canvas content
        is sent. Provider charges may apply.
      </p>
      {disabled && (
        <p className="muted">Save key or endpoint changes first, then choose a model.</p>
      )}
      <div className="provider-actions">
        <button
          type="button"
          disabled={disabled || busy || !model.trim()}
          onClick={() => void test()}
        >
          {busy ? 'Testing…' : 'Test model'}
        </button>
        {busy && (
          <button type="button" onClick={() => controller.current?.abort()}>
            Cancel test
          </button>
        )}
      </div>
      {result?.text && (
        <div role="status">
          <strong>Model responded · {((result.elapsedMs || 0) / 1000).toFixed(2)}s</strong>
          <p className="test-response">{result.text}</p>
        </div>
      )}
      {result?.error && (
        <p role="alert" className="error">
          {result.error}
        </p>
      )}
    </section>
  );
}
