import { pool, RowDataPacket } from '../config/database';
import { decrypt } from './encryption';
import logger from './logger';

export type LlmProvider = 'openai' | 'ollama';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmConfig = {
  provider: LlmProvider;
  aiAssistantEnabled: boolean;
  isConfigured: boolean;
  /** Resolved chat model for the active provider. */
  model: string;
  behavior: string;
  openAiApiKey: string;
  openAIModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
};

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3.2';

function normalizeProvider(value: string | undefined | null): LlmProvider {
  return String(value || '').trim().toLowerCase() === 'ollama' ? 'ollama' : 'openai';
}

function normalizeOllamaBaseUrl(value: string | undefined | null): string {
  const raw = String(value || '').trim() || DEFAULT_OLLAMA_BASE_URL;
  return raw.replace(/\/+$/, '');
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT SettingKey, SettingValue FROM SystemSettings
     WHERE SettingKey IN (?, ?, ?, ?, ?, ?, ?)`,
    [
      'aiAssistantEnabled',
      'aiProvider',
      'openAIApiKey',
      'openAIModel',
      'openAIBehavior',
      'ollamaBaseUrl',
      'ollamaModel',
    ]
  );

  const settingsMap: Record<string, string> = {};
  rows.forEach((row: any) => {
    settingsMap[String(row.SettingKey)] = String(row.SettingValue || '');
  });

  const provider = normalizeProvider(settingsMap.aiProvider);
  const encryptedApiKey = String(settingsMap.openAIApiKey || '').trim();
  const openAiApiKey = encryptedApiKey ? decrypt(encryptedApiKey).trim() : '';
  const openAIModel = String(settingsMap.openAIModel || '').trim() || DEFAULT_OPENAI_MODEL;
  const ollamaBaseUrl = normalizeOllamaBaseUrl(settingsMap.ollamaBaseUrl);
  const ollamaModel = String(settingsMap.ollamaModel || '').trim() || DEFAULT_OLLAMA_MODEL;
  const behavior = String(settingsMap.openAIBehavior || '').trim();
  const aiAssistantEnabled = settingsMap.aiAssistantEnabled === 'true';

  const isConfigured =
    provider === 'ollama'
      ? Boolean(ollamaBaseUrl && ollamaModel)
      : Boolean(openAiApiKey);

  return {
    provider,
    aiAssistantEnabled,
    isConfigured,
    model: provider === 'ollama' ? ollamaModel : openAIModel,
    behavior,
    openAiApiKey,
    openAIModel,
    ollamaBaseUrl,
    ollamaModel,
  };
}

export function llmNotConfiguredMessage(config: LlmConfig): string {
  if (config.provider === 'ollama') {
    return 'Ollama is not configured. Set Base URL and model in System Settings.';
  }
  return 'OpenAI API key is not configured in system settings.';
}

export type ChatCompletionOptions = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Override model from config when needed. */
  model?: string;
};

export type ChatCompletionResult = {
  content: string;
  provider: LlmProvider;
  model: string;
};

/**
 * Call the configured LLM provider using the OpenAI-compatible chat completions API.
 * Ollama exposes the same shape at `{baseUrl}/v1/chat/completions`.
 */
export async function chatCompletion(
  config: LlmConfig,
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  if (!config.isConfigured) {
    throw new Error(llmNotConfiguredMessage(config));
  }

  const model = String(options.model || config.model).trim();
  const temperature = options.temperature ?? 0.2;
  const body: Record<string, unknown> = {
    model,
    temperature,
    messages: options.messages,
  };
  if (typeof options.maxTokens === 'number' && options.maxTokens > 0) {
    body.max_tokens = options.maxTokens;
  }

  let url: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.provider === 'ollama') {
    url = `${config.ollamaBaseUrl}/v1/chat/completions`;
    // Ollama accepts any bearer token; some proxies require the header.
    headers.Authorization = 'Bearer ollama';
  } else {
    url = 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = `Bearer ${config.openAiApiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error('LLM request network error', {
      provider: config.provider,
      url,
      error: detail,
    });
    throw new Error(
      config.provider === 'ollama'
        ? `Cannot reach Ollama at ${config.ollamaBaseUrl}. Is Ollama running? (${detail})`
        : `Cannot reach OpenAI API. (${detail})`
    );
  }

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const apiMessage = String(
      (errorJson as any)?.error?.message || (errorJson as any)?.message || ''
    ).trim();
    const fallback =
      config.provider === 'ollama'
        ? 'Ollama request failed. Check Base URL, model name, and that the model is pulled.'
        : 'OpenAI request failed. Check API key and model configuration.';
    throw new Error(apiMessage || fallback);
  }

  const llmJson = await response.json();
  const content = String(llmJson?.choices?.[0]?.message?.content || '').trim();
  return { content, provider: config.provider, model };
}
