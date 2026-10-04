import type { ReactNode } from 'react';
import type { ProviderId } from '../providers';

function Link({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

const guides: Record<ProviderId, { steps: ReactNode[]; note: ReactNode }> = {
  openai: {
    steps: [
      <>Sign in to the <Link href="https://platform.openai.com/">OpenAI API platform</Link> and choose your project.</>,
      <>Set up <Link href="https://platform.openai.com/settings/organization/billing/overview">API billing</Link>, then create a secret on the <Link href="https://platform.openai.com/api-keys">API keys page</Link>.</>,
      <>Copy the key into API key below and save settings. Choose a GPT model in your node.</>,
    ],
    note: 'Applies to all OpenAI models here. A ChatGPT subscription does not include API usage.',
  },
  anthropic: {
    steps: [
      <>Sign in to the <Link href="https://platform.claude.com/">Claude Console</Link>.</>,
      <>Add <Link href="https://platform.claude.com/settings/billing">API credits</Link> if needed, then create a key in <Link href="https://platform.claude.com/settings/keys">API keys</Link>.</>,
      <>Copy the key below and save settings. Choose a Claude Sonnet, Opus, or Haiku model in your node.</>,
    ],
    note: 'One Anthropic API key covers your available Claude models. Claude app subscriptions are separate.',
  },
  google: {
    steps: [
      <>Sign in to <Link href="https://aistudio.google.com/">Google AI Studio</Link> with your Google account.</>,
      <>Open <Link href="https://aistudio.google.com/apikey">API keys</Link>, choose Create API key, and select or create a project.</>,
      <>Copy the key below and save settings. Choose a Gemini model; enable billing in AI Studio if your model or quota requires it.</>,
    ],
    note: <>Applies to all Gemini models here. Check <Link href="https://ai.google.dev/gemini-api/docs/billing">Gemini API billing and availability</Link> for your project.</>,
  },
  openrouter: {
    steps: [
      <>Sign in to <Link href="https://openrouter.ai/">OpenRouter</Link>.</>,
      <>Create a key in <Link href="https://openrouter.ai/settings/keys">API keys</Link> and add <Link href="https://openrouter.ai/settings/credits">credits</Link> for paid models.</>,
      <>Copy the key below and save settings. Choose any supported model ID from the refreshed list.</>,
    ],
    note: 'An OpenRouter key covers models routed through OpenRouter; do not paste an OpenAI or Anthropic key here.',
  },
  groq: {
    steps: [
      <>Sign in to the <Link href="https://console.groq.com/">Groq Console</Link>.</>,
      <>Open <Link href="https://console.groq.com/keys">API keys</Link>, create a key, and copy it.</>,
      <>Paste it below and save settings. Choose a model from your available Groq models.</>,
    ],
    note: <>One Groq key covers your available models. See <Link href="https://console.groq.com/docs/rate-limits">rate limits</Link> for account limits and plan requirements.</>,
  },
  ollama: {
    steps: [
      <><Link href="https://ollama.com/download">Install Ollama</Link> and start it on your computer.</>,
      <>Install a <Link href="https://ollama.com/search">local model</Link>, for example <code>ollama pull llama3.2</code>.</>,
      <>Keep the base URL below or enter your local server URL. Use Test Connection, save settings, then choose an installed model.</>,
    ],
    note: <>Local models need no API key. For hosted models without a local install, choose Ollama Cloud. For cloud access through the local daemon, follow <Link href="https://docs.ollama.com/cloud">Ollama’s sign-in instructions</Link>.</>,
  },
  ollama_cloud: {
    steps: [
      <>Sign in to <Link href="https://ollama.com/">Ollama</Link> and create a key in <Link href="https://ollama.com/settings/keys">API key settings</Link>.</>,
      <>Copy the key below and save settings. No Ollama installation or model download is needed.</>,
      <>Choose a <Link href="https://ollama.com/search?c=cloud">cloud model</Link> in your node. Use API model names such as <code>gpt-oss:120b</code>, not CLI names ending in <code>-cloud</code>.</>,
    ],
    note: <>The key covers available Ollama Cloud models. Requests go to ollama.com, not your computer. Check <Link href="https://ollama.com/settings/usage">usage</Link> and <Link href="https://ollama.com/pricing">plan limits</Link>.</>,
  },
  custom: {
    steps: [
      <>Open your endpoint provider’s own account dashboard and create an API key using its documentation. There is no universal custom-provider key.</>,
      <>Enter its OpenAI-compatible API root, API key, and exact model name below. Include <code>/v1</code> if required.</>,
      <>Save settings, then choose the model under Custom endpoint. See the <Link href="https://platform.openai.com/docs/api-reference/authentication">OpenAI-compatible authentication format</Link>.</>,
    ],
    note: 'Use the key issued by your endpoint operator, not an unrelated provider’s key.',
  },
};

export function ProviderSetup({ id }: { id: ProviderId }) {
  const guide = guides[id];
  return <section className="provider-setup" aria-label="Provider setup guide">
    <h4>{id === 'ollama' ? 'Set up local models' : 'How to get an API key'}</h4>
    <ol>{guide.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
    <p>{guide.note}</p>
  </section>;
}
