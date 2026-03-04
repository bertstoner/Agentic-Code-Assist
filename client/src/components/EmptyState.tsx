import { Terminal } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center h-full bg-background relative overflow-hidden p-6">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      
      {/* Decorative center glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="relative z-10 max-w-md w-full p-8 border border-border bg-card/80 backdrop-blur-xl shadow-2xl rounded-sm">
        <div className="flex items-center gap-3 text-primary border-b border-border pb-5 mb-6">
          <Terminal className="w-6 h-6" />
          <h2 className="text-xl font-bold tracking-widest">SYSTEM_READY</h2>
        </div>
        
        <div className="space-y-4 text-sm leading-loose tracking-wide text-foreground/80">
          <p>
            <span className="text-primary font-bold mr-2">STATUS:</span> 
            <span className="text-foreground">ONLINE</span>
            <br />
            <span className="text-primary font-bold mr-2">MODELS:</span> 
            <span className="text-foreground">INITIALIZED</span>
            <br />
            <span className="text-primary font-bold mr-2">UPLINK:</span> 
            <span className="text-foreground">ACTIVE</span>
          </p>
          <p className="opacity-60 pt-2 text-xs">
            Select an existing session from the sidebar or initialize a new one to begin interaction.
          </p>
        </div>
        
        <div className="pt-6 mt-6 border-t border-border flex justify-between text-[10px] opacity-40 tracking-widest">
          <span>v1.0.0-beta</span>
          <span>SECURE_CONNECTION</span>
        </div>
      </div>
    </div>
  );
}
