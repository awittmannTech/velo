import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCreate = vi.fn();
const mockModelsList = vi.fn();

vi.mock("openai", () => {
  const MockOpenAI = vi.fn(function () {
    return {
      chat: { completions: { create: mockCreate } },
      models: { list: mockModelsList },
    };
  });
  return { default: MockOpenAI };
});

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

import OpenAI from "openai";
import { createOllamaProvider, listOllamaModels, clearOllamaProvider } from "./ollamaProvider";

describe("ollamaProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearOllamaProvider();
  });

  describe("createOllamaProvider", () => {
    it("creates OpenAI client with custom baseURL and dummy API key", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/v1",
        apiKey: "ollama",
        dangerouslyAllowBrowser: true,
        fetch: expect.any(Function),
      });
    });

    it("strips trailing slashes from server URL", () => {
      createOllamaProvider("http://localhost:11434///", "llama3.2");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/v1",
        apiKey: "ollama",
        dangerouslyAllowBrowser: true,
        fetch: expect.any(Function),
      });
    });

    it("tolerates a server URL that already ends in /v1 (no /v1/v1)", () => {
      createOllamaProvider("http://localhost:1234/v1", "llama3.2");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:1234/v1",
        apiKey: "ollama",
        dangerouslyAllowBrowser: true,
        fetch: expect.any(Function),
      });
    });

    it("tolerates a trailing /v1/ with a slash", () => {
      createOllamaProvider("http://localhost:1234/v1/", "llama3.2");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:1234/v1",
        apiKey: "ollama",
        dangerouslyAllowBrowser: true,
        fetch: expect.any(Function),
      });
    });

    it("passes a configured api key through to the client", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2", "sk-secret");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/v1",
        apiKey: "sk-secret",
        dangerouslyAllowBrowser: true,
        fetch: expect.any(Function),
      });
    });

    it("falls back to the placeholder key when the api key is blank", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2", "   ");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/v1",
        apiKey: "ollama",
        dangerouslyAllowBrowser: true,
        fetch: expect.any(Function),
      });
    });
  });

  describe("listOllamaModels", () => {
    it("returns sorted model ids from the /v1/models endpoint", async () => {
      mockModelsList.mockResolvedValue({
        data: [{ id: "qwen2.5" }, { id: "llama3.2" }, { id: "" }],
      });

      const models = await listOllamaModels("http://localhost:11434");

      expect(models).toEqual(["llama3.2", "qwen2.5"]);
    });

    it("passes the api key through when probing models", async () => {
      mockModelsList.mockResolvedValue({ data: [] });

      await listOllamaModels("http://localhost:11434", "sk-secret");

      expect(OpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/v1",
        apiKey: "sk-secret",
        dangerouslyAllowBrowser: true,
        fetch: expect.any(Function),
      });
    });

    it("propagates errors so the UI can fall back to manual entry", async () => {
      mockModelsList.mockRejectedValue(new Error("Connection refused"));

      await expect(listOllamaModels("http://localhost:11434")).rejects.toThrow();
    });
  });

  describe("complete", () => {
    it("calls chat.completions.create with correct model and messages", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "Hello!" } }],
      });

      const provider = createOllamaProvider("http://localhost:11434", "llama3.2");
      const result = await provider.complete({
        systemPrompt: "You are helpful",
        userContent: "Hi",
      });

      expect(result).toBe("Hello!");
      expect(mockCreate).toHaveBeenCalledWith({
        model: "llama3.2",
        max_tokens: 1024,
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hi" },
        ],
      });
    });

    it("returns empty string when no content in response", async () => {
      mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

      const provider = createOllamaProvider("http://localhost:11434", "llama3.2");
      const result = await provider.complete({
        systemPrompt: "sys",
        userContent: "user",
      });

      expect(result).toBe("");
    });
  });

  describe("testConnection", () => {
    it("returns true on successful completion", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: "hi" } }],
      });

      const provider = createOllamaProvider("http://localhost:11434", "llama3.2");
      expect(await provider.testConnection()).toBe(true);
    });

    it("returns false when completion throws", async () => {
      mockCreate.mockRejectedValue(new Error("Connection refused"));

      const provider = createOllamaProvider("http://localhost:11434", "llama3.2");
      expect(await provider.testConnection()).toBe(false);
    });
  });

  describe("factory caching", () => {
    it("reuses client for same url+model", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");
      createOllamaProvider("http://localhost:11434", "llama3.2");

      expect(OpenAI).toHaveBeenCalledTimes(1);
    });

    it("creates new client when url changes", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");
      createOllamaProvider("http://localhost:1234", "llama3.2");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });

    it("reuses client when only the model changes (client depends on url+key only)", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");
      createOllamaProvider("http://localhost:11434", "mistral");

      expect(OpenAI).toHaveBeenCalledTimes(1);
    });

    it("creates new client when api key changes", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2", "secret-a");
      createOllamaProvider("http://localhost:11434", "llama3.2", "secret-b");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });

    it("creates new client after clearOllamaProvider", () => {
      createOllamaProvider("http://localhost:11434", "llama3.2");
      clearOllamaProvider();
      createOllamaProvider("http://localhost:11434", "llama3.2");

      expect(OpenAI).toHaveBeenCalledTimes(2);
    });
  });
});
