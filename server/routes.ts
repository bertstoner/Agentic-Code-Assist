import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_MODEL = "gpt-oss-120b";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

      // Stream response from Perplexity
      const upstream = await fetch(CEREBRAS_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.CEREBRAS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CEREBRAS_MODEL,
          messages: chatMessages,
          stream: true,
          max_tokens: 8192,
        }),
      });

      if (!upstream.ok) {
        const err = await upstream.text();
        throw new Error(`Cerebras API error ${upstream.status}: ${err}`);
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
