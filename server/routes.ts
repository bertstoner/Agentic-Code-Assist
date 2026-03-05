import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";
const CEREBRAS_DEFAULT_MODEL = "gpt-oss-120b";
const OLLAMA_BASE_URL = "http://localhost:11434/v1";
const OLLAMA_DEFAULT_MODEL = "llama3.2";

let _onlineCache: { value: boolean; ts: number } | null = null;

async function checkOnline(): Promise<boolean> {
  const now = Date.now();
  if (_onlineCache && now - _onlineCache.ts < 10_000) {
    return _onlineCache.value;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${CEREBRAS_BASE_URL}/models`, {
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${process.env.CEREBRAS_API_KEY}` },
    });
    clearTimeout(timeout);
    _onlineCache = { value: res.ok, ts: now };
  } catch {
    _onlineCache = { value: false, ts: now };
  }
  return _onlineCache!.value;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.status.get.path, async (_req, res) => {
    const online = await checkOnline();
    res.json({ online, backend: online ? "cerebras" : "ollama" });
  });

  app.get(api.models.list.path, async (_req, res) => {
    try {
      const online = await checkOnline();
      if (online) {
        const upstream = await fetch(`${CEREBRAS_BASE_URL}/models`, {
          headers: { "Authorization": `Bearer ${process.env.CEREBRAS_API_KEY}` },
        });
        const data = await upstream.json() as { data: { id: string }[] };
        res.json(data.data.map((m) => ({ id: m.id })));
      } else {
        try {
          const upstream = await fetch(`${OLLAMA_BASE_URL}/models`);
          const data = await upstream.json() as { data: { id: string }[] };
          res.json(data.data.map((m) => ({ id: m.id })));
        } catch {
          res.json([{ id: OLLAMA_DEFAULT_MODEL }]);
        }
      }
    } catch {
      res.status(500).json({ message: "Failed to fetch models" });
    }
  });

  // Seed initial data if empty
  const existingConvos = await storage.getAllConversations();
  if (existingConvos.length === 0) {
    const convo = await storage.createConversation("Initial Chat");
    await storage.createMessage(convo.id, "assistant", "Hello! I am your AI assistant. How can I help you today?");
  }

  app.get(api.conversations.list.path, async (req, res) => {
    const conversations = await storage.getAllConversations();
    res.json(conversations);
  });

  app.get(api.conversations.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const conversation = await storage.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    const messages = await storage.getMessagesByConversation(id);
    res.json({ ...conversation, messages });
  });

  app.post(api.conversations.create.path, async (req, res) => {
    try {
      const input = api.conversations.create.input.parse(req.body);
      const title = input.title || "New Chat";
      const conversation = await storage.createConversation(title);
      res.status(201).json(conversation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.conversations.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const conversation = await storage.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    await storage.deleteConversation(id);
    res.status(204).send();
  });

  app.post(api.conversations.sendMessage.path, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const input = api.conversations.sendMessage.input.parse(req.body);

      // Verify conversation exists
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Save user message
      await storage.createMessage(conversationId, "user", input.content);

      // Get conversation history for context
      const messages = await storage.getMessagesByConversation(conversationId);
      const chatMessages = messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Route to Cerebras (online) or Ollama (offline)
      const online = await checkOnline();
      const baseUrl = online ? CEREBRAS_BASE_URL : OLLAMA_BASE_URL;
      const defaultModel = online ? CEREBRAS_DEFAULT_MODEL : OLLAMA_DEFAULT_MODEL;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (online) headers["Authorization"] = `Bearer ${process.env.CEREBRAS_API_KEY}`;

      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: input.model ?? defaultModel,
          messages: chatMessages,
          stream: true,
          max_tokens: 8192,
        }),
      });

      if (!upstream.ok) {
        const err = await upstream.text();
        throw new Error(`${online ? "Cerebras" : "Ollama"} API error ${upstream.status}: ${err}`);
      }

      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === "[DONE]") continue;
          try {
            const chunk = JSON.parse(dataStr);
            const content: string | undefined = chunk.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      // Save assistant message
      await storage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ message: "Failed to send message" });
      }
    }
  });

  return httpServer;
}
