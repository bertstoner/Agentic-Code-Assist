import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { EmptyState } from "@/components/EmptyState";
import { useRoute } from "wouter";

export default function ChatPage() {
  const [match, params] = useRoute("/chat/:id");
  const conversationId = match ? parseInt(params.id) : undefined;

  return (
    <div className="flex h-screen w-full bg-background text-foreground font-mono overflow-hidden">
      <Sidebar />
      {conversationId ? (
        <ChatPanel id={conversationId} key={conversationId} />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
