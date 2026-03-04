import { Link, useLocation } from "wouter";
import { useConversations, useCreateConversation, useDeleteConversation } from "@/hooks/use-chat";
import { MessageSquare, Plus, Trash2, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { data: conversations, isLoading } = useConversations();
  const createMutation = useCreateConversation();
  const deleteMutation = useDeleteConversation();
  const [location, setLocation] = useLocation();

  const handleCreate = async () => {
    const newConv = await createMutation.mutateAsync("New Session");
    setLocation(`/chat/${newConv.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteMutation.mutateAsync(id);
    if (location === `/chat/${id}`) {
      setLocation("/");
    }
  };

  return (
    <div className="w-72 bg-card border-r border-border h-full flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.2)] z-20">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-primary font-bold tracking-widest text-sm hover:opacity-80 transition-opacity">
          <TerminalSquare className="w-5 h-5" />
          <span>AGENT_STACK</span>
          <span className="animate-pulse">_</span>
        </Link>
      </div>
      
      <div className="p-4">
        <button
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-primary/10 text-primary border border-primary/50 hover:border-primary rounded-sm py-2 px-4 transition-all text-sm tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {createMutation.isPending ? "INITIALIZING..." : "NEW_SESSION"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 py-2">
        <div className="text-xs text-muted-foreground/70 mb-3 px-4 font-bold tracking-widest">SESSIONS</div>
        
        {isLoading ? (
          <div className="text-center text-primary/50 text-sm py-8 animate-pulse tracking-widest">
            LOADING...
          </div>
        ) : conversations?.length === 0 ? (
          <div className="text-center text-muted-foreground/50 text-sm py-8 px-4">
            No active sessions.
          </div>
        ) : conversations?.map((conv) => {
          const isActive = location === `/chat/${conv.id}`;
          return (
            <Link key={conv.id} href={`/chat/${conv.id}`} className={cn(
              "flex items-center justify-between group py-2.5 px-4 transition-colors relative",
              isActive 
                ? "bg-primary/10 text-primary border-l-2 border-primary" 
                : "hover:bg-muted text-muted-foreground hover:text-foreground border-l-2 border-transparent"
            )}>
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <div className="truncate text-sm tracking-wide">
                  {conv.title}
                </div>
              </div>
              <button 
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-destructive hover:bg-destructive/10 rounded transition-all shrink-0"
                title="Terminate Session"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
