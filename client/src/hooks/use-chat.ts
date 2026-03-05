import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

export function useStatus() {
  return useQuery({
    queryKey: [api.status.get.path],
    queryFn: async () => {
      const res = await fetch(api.status.get.path);
      if (!res.ok) throw new Error("Failed to fetch status");
      return api.status.get.responses[200].parse(await res.json());
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useModels() {
  return useQuery({
    queryKey: [api.models.list.path],
    queryFn: async () => {
      const res = await fetch(api.models.list.path);
      if (!res.ok) throw new Error("Failed to fetch models");
      return api.models.list.responses[200].parse(await res.json());
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: [api.conversations.list.path],
    queryFn: async () => {
      const res = await fetch(api.conversations.list.path);
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return api.conversations.list.responses[200].parse(await res.json());
    }
  });
}

export function useConversation(id?: number) {
  return useQuery({
    queryKey: [api.conversations.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.conversations.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return api.conversations.get.responses[200].parse(await res.json());
    },
    enabled: !!id
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title?: string) => {
      const res = await fetch(api.conversations.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      return api.conversations.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
    }
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.conversations.delete.path, { id });
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete conversation");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
    }
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ conversationId, content, model }: { conversationId: number, content: string, model?: string }) => {
      const url = buildUrl(api.conversations.sendMessage.path, { id: conversationId });

      // Update cache optimistically
      queryClient.setQueryData([api.conversations.get.path, conversationId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: [
            ...old.messages,
            { id: Date.now(), conversationId, role: "user", content, createdAt: new Date().toISOString() },
            { id: Date.now() + 1, conversationId, role: "assistant", content: "", createdAt: new Date().toISOString() }
          ]
        };
      });

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, model })
      });

      if (!res.ok) throw new Error("Failed to send message");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // keep incomplete line
        
        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            const dataStr = line.trim().substring(6);
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.done) {
                // Done - handled in onSuccess
              } else if (data.content) {
                assistantContent += data.content;
                queryClient.setQueryData([api.conversations.get.path, conversationId], (old: any) => {
                  if (!old) return old;
                  const newMessages = [...old.messages];
                  const lastMsg = newMessages[newMessages.length - 1];
                  if (lastMsg.role === 'assistant') {
                    newMessages[newMessages.length - 1] = { ...lastMsg, content: assistantContent };
                  }
                  return { ...old, messages: newMessages };
                });
              } else if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              console.error("Failed to parse SSE chunk", e);
            }
          }
        }
      }
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: [api.conversations.get.path, conversationId] });
      queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
    },
    onError: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: [api.conversations.get.path, conversationId] });
    }
  });
}
