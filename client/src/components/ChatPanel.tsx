import { useEffect, useRef, useState } from "react";
import { useConversation, useSendMessage, useModels, useStatus } from "@/hooks/use-chat";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Send, Terminal, ChevronDown, Wifi, WifiOff } from "lucide-react";
import { format } from "date-fns";

export function ChatPanel({ id }: { id: number }) {
  const { data: conversation, isLoading } = useConversation(id);
  const { data: models } = useModels();
  const { data: status } = useStatus();
  const sendMutation = useSendMessage();
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (models?.length && !selectedModel) {
      setSelectedModel(models.find(m => m.id === "gpt-oss-120b")?.id ?? models[0].id);
    }
  }, [models]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ conversationId: id, content: input.trim(), model: selectedModel || undefined });
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="text-primary animate-pulse tracking-widest z-10 font-bold flex items-center gap-3">
          <Terminal className="w-5 h-5" /> ESTABLISHING_UPLINK...
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive tracking-widest font-bold bg-background">
        SESSION_NOT_FOUND
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      {/* Header */}
      <div className="border-b border-border p-4 flex items-center gap-3 text-sm tracking-widest bg-background/95 backdrop-blur z-10 shadow-sm">
        <Terminal className="w-4 h-4 text-primary" />
        <span className="text-muted-foreground/70">~/sessions/</span>
        <span className="text-foreground">{conversation.title.toLowerCase().replace(/ /g, '_')}</span>
        {status ? (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-widest border ${
            status.online
              ? "text-green-400 border-green-400/30 bg-green-400/10"
              : "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
          }`}>
            {status.online
              ? <><Wifi className="w-3 h-3" /> ONLINE · CEREBRAS</>
              : <><WifiOff className="w-3 h-3" /> OFFLINE · OLLAMA</>
            }
          </div>
        ) : null}
        <div className="ml-auto relative">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="appearance-none bg-card border border-border text-xs text-muted-foreground tracking-widest px-3 py-1.5 pr-7 rounded focus:outline-none focus:border-primary/50 cursor-pointer hover:border-primary/30 transition-colors"
          >
            {models?.map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-muted-foreground/50 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 pb-36 scroll-smooth z-10">
        {conversation.messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-primary/40 space-y-4">
            <Terminal className="w-16 h-16 opacity-50" />
            <p className="tracking-widest">AWAITING_INPUT...</p>
          </div>
        ) : (
          conversation.messages.map((m) => (
            <div key={m.id} className="flex flex-col group max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-3 mb-3 text-xs tracking-widest">
                {m.role === 'user' ? (
                  <span className="text-blue-400 font-bold flex items-center gap-2">
                    <span className="opacity-50">➜</span> USER
                  </span>
                ) : (
                  <span className="text-primary font-bold flex items-center gap-2">
                    <span className="opacity-50">⚡</span> AGENT
                  </span>
                )}
                <span className="text-muted-foreground/40">{format(new Date(m.createdAt), "HH:mm:ss")}</span>
              </div>
              <div className="pl-4 border-l-2 border-border/50 group-hover:border-primary/40 transition-colors">
                {m.content.length === 0 ? (
                  <span className="inline-block w-2.5 h-4 bg-primary animate-pulse align-middle" />
                ) : (
                  <MarkdownRenderer content={m.content} />
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-16 pb-6 px-4 md:px-8 z-20">
        <div className="max-w-4xl mx-auto relative group">
          {/* Subtle glow effect behind input */}
          <div className="absolute -inset-0.5 bg-primary/20 blur-md opacity-0 group-focus-within:opacity-100 transition duration-500 rounded-lg"></div>
          
          <div className="relative flex items-end gap-3 bg-card border border-border rounded-lg p-3 shadow-2xl focus-within:border-primary/50 transition-colors">
            <div className="pb-2 pl-2 text-primary font-bold opacity-80">➜</div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Enter command or message..."
              className="flex-1 bg-transparent border-0 focus:ring-0 py-2 px-1 resize-none max-h-[40vh] overflow-y-auto text-foreground placeholder:text-muted-foreground/40 outline-none leading-relaxed"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              className="p-3 mb-0.5 text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground transition-all bg-background rounded-md border border-border hover:border-primary/40 active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center mt-3 text-[10px] text-muted-foreground/40 tracking-widest uppercase">
            SHIFT + ENTER FOR NEWLINE
          </div>
        </div>
      </div>
    </div>
  );
}
