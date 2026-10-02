import { useEffect, useMemo, useState } from "react";
import { Button, IconButton, MaterialSymbol } from "./material";
import {
  ensureEndpointPermission,
  getActiveProviderConfig,
  getProviderConfigError,
  getProviderLabel,
  listProviderModels,
  testSelectedModel,
  type ProviderModel,
} from "../lib/providers";
import {
  MAX_READING_FONT_SIZE_PX,
  MIN_READING_FONT_SIZE_PX,
  READING_FONT_OPTIONS,
  normalizeReadingFontSize,
} from "../lib/typography";
import type {
  LocalApiFormat,
  ProviderConfig,
  ProviderId,
  ReadingFontStyle,
  Settings,
  ThemePreference,
} from "../types";

type SettingsPanelProps = {
  settings: Settings;
  boardName: string;
  onChange: (settings: Settings) => void;
  onSave: (settings: Settings) => Promise<void>;
  onClose: () => void;
  onClearConversations: () => void;
  onClearAnnotations: () => void;
};

type Feedback = { type: "success" | "error"; message: string } | null;

const KEY_PLACEHOLDERS: Record<Exclude<ProviderId, "local">, string> = {
  gemini: "AIza...",
  openai: "sk-...",
  anthropic: "sk-ant-...",
  "ollama-cloud": "Ollama API key",
};

function getKeyPlaceholder(provider: ProviderId): string {
  return provider === "local" ? "Optional API key" : KEY_PLACEHOLDERS[provider];
}

function updateProviderConfig(
  settings: Settings,
  patch: Partial<ProviderConfig>,
): Settings {
  const provider = settings.provider;
  return {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: { ...settings.providers[provider], ...patch },
    },
  };
}

function SetupInstructions({ settings }: { settings: Settings }) {
  const provider = settings.provider;
  if (provider === "gemini") {
    return (
      <ol>
        <li>Create a key in <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.</li>
        <li>Paste it above, refresh models, then test the selected model.</li>
      </ol>
    );
  }
  if (provider === "openai") {
    return (
      <ol>
        <li>Create a key in the <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI dashboard</a>.</li>
        <li>Refresh the account model list and test a chat-capable model.</li>
      </ol>
    );
  }
  if (provider === "anthropic") {
    return (
      <ol>
        <li>Create a key in the <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Anthropic Console</a>.</li>
        <li>Refresh models, select one, and run the connection test.</li>
      </ol>
    );
  }
  if (provider === "ollama-cloud") {
    return (
      <ol>
        <li>Create an API key in your <a href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer">Ollama settings</a>.</li>
        <li>Refresh the live cloud catalog instead of entering a hard-coded model.</li>
      </ol>
    );
  }

  const format = settings.providers.local.apiFormat;
  return format === "ollama" ? (
    <ol>
      <li>Run Ollama and use its root endpoint, usually <code>http://localhost:11434</code>.</li>
      <li>Pull at least one model locally, then use Refresh models and Test selected model.</li>
      <li>If Ollama rejects the extension origin, launch it with <code>OLLAMA_ORIGINS=chrome-extension://*</code> or allow only this extension&apos;s origin.</li>
    </ol>
  ) : (
    <ol>
      <li>Start LM Studio, vLLM, LocalAI, or another OpenAI-compatible server.</li>
      <li>Enter its API base path, such as <code>http://localhost:1234/v1</code>.</li>
      <li>Add a key only if your server requires one, then refresh and test.</li>
    </ol>
  );
}

export function SettingsPanel({
  settings,
  boardName,
  onChange,
  onSave,
  onClose,
  onClearConversations,
  onClearAnnotations,
}: SettingsPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [busy, setBusy] = useState<"models" | "test" | "save" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const config = getActiveProviderConfig(settings);
  const providerLabel = getProviderLabel(settings.provider);

  useEffect(() => {
    setModels([]);
    setFeedback(null);
    setShowApiKey(false);
  }, [settings.provider]);

  const modelOptions = useMemo(() => {
    if (!config.model || models.some((model) => model.id === config.model)) {
      return models;
    }
    return [{ id: config.model, name: "Saved or custom model" }, ...models];
  }, [config.model, models]);

  const changeProvider = (provider: ProviderId) => {
    onChange({ ...settings, provider });
  };

  const changeConfig = (patch: Partial<ProviderConfig>) => {
    onChange(updateProviderConfig(settings, patch));
  };

  const changeLocal = (
    patch: Partial<{ apiFormat: LocalApiFormat; endpoint: string }>,
  ) => {
    onChange({
      ...settings,
      providers: {
        ...settings.providers,
        local: { ...settings.providers.local, ...patch },
      },
    });
  };

  const requestAccess = async () => {
    const granted = await ensureEndpointPermission(settings);
    if (!granted) throw new Error("Endpoint access was not granted.");
  };

  const refreshModels = async () => {
    setBusy("models");
    setFeedback(null);
    try {
      const configError =
        settings.provider === "ollama-cloud"
          ? null
          : getProviderConfigError(settings, false);
      if (configError) throw new Error(configError);
      await requestAccess();
      const nextModels = await listProviderModels(settings);
      if (!nextModels.length) throw new Error(`${providerLabel} returned no models.`);
      setModels(nextModels);
      if (!config.model.trim()) changeConfig({ model: nextModels[0].id });
      setFeedback({
        type: "success",
        message: `Found ${nextModels.length} model${nextModels.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Could not load models.",
      });
    } finally {
      setBusy(null);
    }
  };

  const testConnection = async () => {
    setBusy("test");
    setFeedback(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const configError = getProviderConfigError(settings);
      if (configError) throw new Error(configError);
      await requestAccess();
      const response = await testSelectedModel(settings, controller.signal);
      const preview = response.replace(/\s+/g, " ").trim().slice(0, 160);
      setFeedback({
        type: "success",
        message: `Connected. ${preview ? `Response: ${preview}` : "The model responded."}`,
      });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "The model test timed out after 30 seconds."
          : error instanceof Error
            ? error.message
            : "The model test failed.";
      setFeedback({ type: "error", message });
    } finally {
      window.clearTimeout(timeout);
      setBusy(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("save");
    setFeedback(null);
    try {
      await requestAccess();
      await onSave(settings);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Could not save settings.",
      });
      setBusy(null);
    }
  };

  const isLocal = settings.provider === "local";
  const keyPlaceholder = getKeyPlaceholder(settings.provider);

  return (
    <aside className="settings-panel">
      <header className="settings-header">
        <div>
          <span className="panel-kicker">BRANCHBOARD</span>
          <h2 id="settings-panel-title">Settings</h2>
        </div>
        <IconButton label="Close settings" icon="close" onClick={onClose} />
      </header>

      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <div className="settings-section-heading">
          <span className="settings-section-icon" aria-hidden="true">
            <MaterialSymbol name="account_tree" size={20} />
          </span>
          <div>
            <h3>Model connection</h3>
            <p>Choose the provider and model for new conversations. Existing nodes keep their original route.</p>
          </div>
        </div>

        <label htmlFor="provider">Provider</label>
        <select
          id="provider"
          value={settings.provider}
          disabled={busy !== null}
          onChange={(event) => changeProvider(event.target.value as ProviderId)}
        >
          <optgroup label="Cloud providers">
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama-cloud">Ollama Cloud</option>
          </optgroup>
          <optgroup label="Your infrastructure">
            <option value="local">Local endpoint</option>
          </optgroup>
        </select>

        {isLocal && (
          <div className="local-fields">
            <label htmlFor="api-format">API format</label>
            <select
              id="api-format"
              value={settings.providers.local.apiFormat}
              disabled={busy !== null}
              onChange={(event) =>
                changeLocal({ apiFormat: event.target.value as LocalApiFormat })
              }
            >
              <option value="ollama">Ollama native API</option>
              <option value="openai-compatible">OpenAI-compatible API</option>
            </select>

            <label htmlFor="endpoint">Endpoint</label>
            <input
              id="endpoint"
              type="url"
              value={settings.providers.local.endpoint}
              disabled={busy !== null}
              spellCheck={false}
              placeholder={
                settings.providers.local.apiFormat === "ollama"
                  ? "http://localhost:11434"
                  : "http://localhost:1234/v1"
              }
              onChange={(event) => changeLocal({ endpoint: event.target.value })}
            />
          </div>
        )}

        <label htmlFor="api-key">{isLocal ? "API key (optional)" : `${providerLabel} API key`}</label>
        <div className="secret-input">
          <input
            id="api-key"
            type={showApiKey ? "text" : "password"}
            value={config.apiKey}
            disabled={busy !== null}
            placeholder={keyPlaceholder}
            autoComplete="off"
            onChange={(event) => changeConfig({ apiKey: event.target.value })}
          />
          <IconButton
            label={showApiKey ? "Hide API key" : "Show API key"}
            icon={showApiKey ? "visibility_off" : "visibility"}
            onClick={() => setShowApiKey((current) => !current)}
          />
        </div>
        <p className="field-note">
          Stored unencrypted in this browser profile. Requests go directly to the selected provider or endpoint.
        </p>

        <label htmlFor="model-list">Available models</label>
        <select
          id="model-list"
          value={config.model}
          disabled={busy !== null}
          onChange={(event) => changeConfig({ model: event.target.value })}
        >
          {!config.model && <option value="">Refresh models to choose</option>}
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name && model.name !== model.id ? `${model.name} (${model.id})` : model.id}
            </option>
          ))}
        </select>

        <label htmlFor="custom-model">Custom model ID</label>
        <input
          id="custom-model"
          type="text"
          value={config.model}
          disabled={busy !== null}
          spellCheck={false}
          placeholder="Enter an exact model ID"
          onChange={(event) => changeConfig({ model: event.target.value })}
        />

        <div className="connection-actions">
          <Button variant="outlined" leadingIcon="refresh" loading={busy === "models"} disabled={busy !== null} onClick={() => void refreshModels()}>
            Refresh models
          </Button>
          <Button variant="outlined" leadingIcon="science" loading={busy === "test"} disabled={busy !== null} onClick={() => void testConnection()}>
            Test selected model
          </Button>
        </div>

        {feedback && (
          <div className={`connection-feedback is-${feedback.type}`} role="status">
            {feedback.type === "success" && <MaterialSymbol name="check_circle" size={20} />}
            <span>{feedback.message}</span>
          </div>
        )}

        <fieldset className="appearance-setting">
          <legend>Appearance</legend>
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={settings.theme}
            disabled={busy !== null}
            onChange={(event) =>
              onChange({ ...settings, theme: event.target.value as ThemePreference })
            }
          >
            <option value="system">System default</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>

          <label htmlFor="reading-font-style">Reading font</label>
          <select
            id="reading-font-style"
            value={settings.readingFontStyle}
            disabled={busy !== null}
            onChange={(event) =>
              onChange({
                ...settings,
                readingFontStyle: event.target.value as ReadingFontStyle,
              })
            }
          >
            {READING_FONT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label htmlFor="reading-font-size">Reading size</label>
          <div className="font-size-stepper">
            <IconButton
              label="Decrease reading text size"
              icon="remove"
              disabled={
                busy !== null ||
                settings.readingFontSizePx <= MIN_READING_FONT_SIZE_PX
              }
              onClick={() =>
                onChange({
                  ...settings,
                  readingFontSizePx: normalizeReadingFontSize(
                    settings.readingFontSizePx - 1,
                  ),
                })
              }
            />
            <div>
              <input
                id="reading-font-size"
                type="number"
                inputMode="numeric"
                min={MIN_READING_FONT_SIZE_PX}
                max={MAX_READING_FONT_SIZE_PX}
                step={1}
                value={settings.readingFontSizePx}
                disabled={busy !== null}
                aria-describedby="reading-font-size-note"
                onChange={(event) => {
                  if (!Number.isFinite(event.target.valueAsNumber)) return;
                  onChange({
                    ...settings,
                    readingFontSizePx: normalizeReadingFontSize(
                      event.target.valueAsNumber,
                    ),
                  });
                }}
              />
              <span>px</span>
            </div>
            <IconButton
              label="Increase reading text size"
              icon="add"
              disabled={
                busy !== null ||
                settings.readingFontSizePx >= MAX_READING_FONT_SIZE_PX
              }
              onClick={() =>
                onChange({
                  ...settings,
                  readingFontSizePx: normalizeReadingFontSize(
                    settings.readingFontSizePx + 1,
                  ),
                })
              }
            />
          </div>
          <p id="reading-font-size-note" className="field-note appearance-note">
            Applies to prompts, responses, the composer, and sticky notes. Code and math keep their specialized fonts.
          </p>
        </fieldset>

        <Button type="submit" variant="filled" loading={busy === "save"} disabled={busy !== null}>
          Save settings
        </Button>
      </form>

      <section className="setup-guide">
        <span className="panel-kicker">SETUP · {providerLabel.toUpperCase()}</span>
        <SetupInstructions settings={settings} />
        <p>Connection tests send a tiny real prompt and may consume a small number of tokens.</p>
      </section>

      <div className="settings-section-heading settings-data-heading">
        <span className="settings-section-icon" aria-hidden="true">
          <MaterialSymbol name="description" size={20} />
        </span>
        <div>
          <h3>Board data</h3>
          <p>These actions affect “{boardName}” only.</p>
        </div>
      </div>

      <div className="settings-danger">
        <div>
          <strong>Clear conversations</strong>
          <span>Delete conversation nodes from {boardName}; keep notes and ink.</span>
        </div>
        <Button type="button" variant="text" tone="error" onClick={onClearConversations}>Clear</Button>
      </div>
      <div className="settings-danger settings-danger-secondary">
        <div>
          <strong>Clear annotations</strong>
          <span>Delete sticky notes and pen strokes; keep conversations.</span>
        </div>
        <Button type="button" variant="text" tone="error" onClick={onClearAnnotations}>Clear</Button>
      </div>
    </aside>
  );
}
