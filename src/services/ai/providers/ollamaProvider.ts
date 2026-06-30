import OpenAI from "openai";
import { fetch } from "@tauri-apps/plugin-http";
import type { AiProviderClient, AiCompletionRequest } from "../types";

let instance: OpenAI | null = null;
let cachedKey: string | null = null;

// The OpenAI SDK rejects an empty apiKey. Local servers (Ollama / LM Studio)
// ignore it, so fall back to a harmless placeholder when none is configured.
// A real value is sent as `Authorization: Bearer <key>` by the SDK.
function resolveKey(apiKey?: string): string {
  const trimmed = apiKey?.trim();
  return trimmed ? trimmed : "ollama";
}

// Builds the OpenAI-compatible base URL. Tolerates a trailing `/v1` that users
// often copy from LM Studio's displayed endpoint, so both `http://host:1234`
// and `http://host:1234/v1` resolve to a single `/v1` (avoids `/v1/v1/...`).
function normalizeBaseUrl(serverUrl: string): string {
  const root = serverUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/i, "")
    .replace(/\/+$/, "");
  return `${root}/v1`;
}

// The client only depends on baseURL + apiKey, so cache on those. The model is
// passed per-request, not at construction time.
function getClient(serverUrl: string, apiKey: string): OpenAI {
  const baseURL = normalizeBaseUrl(serverUrl);
  const cacheKey = `${baseURL}|${apiKey}`;
  if (!instance || cachedKey !== cacheKey) {
    instance = new OpenAI({
      baseURL,
      apiKey,
      dangerouslyAllowBrowser: true,
      fetch,
    });
    cachedKey = cacheKey;
  }
  return instance;
}

export function createOllamaProvider(serverUrl: string, model: string, apiKey?: string): AiProviderClient {
  const client = getClient(serverUrl, resolveKey(apiKey));

  return {
    async complete(req: AiCompletionRequest): Promise<string> {
      const response = await client.chat.completions.create({
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userContent },
        ],
      });

      return response.choices[0]?.message?.content ?? "";
    },

    async testConnection(): Promise<boolean> {
      try {
        await client.chat.completions.create({
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: "Say hi" }],
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

// Probes the server's OpenAI-compatible `GET /v1/models` endpoint (supported by
// Ollama, LM Studio, vLLM and most gateways) so the UI can offer a dropdown.
export async function listOllamaModels(serverUrl: string, apiKey?: string): Promise<string[]> {
  const client = getClient(serverUrl, resolveKey(apiKey));
  const res = await client.models.list();
  return res.data
    .map((m) => m.id)
    .filter((id): id is string => !!id)
    .sort((a, b) => a.localeCompare(b));
}

export function clearOllamaProvider(): void {
  instance = null;
  cachedKey = null;
}
