import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code(props) {
          const { children, className, node, ...rest } = props;
          const match = /language-(\w+)/.exec(className || '');
          
          return match ? (
            <SyntaxHighlighter
              {...(rest as any)}
              PreTag="div"
              children={String(children).replace(/\n$/, '')}
              language={match[1]}
              style={atomDark}
              className="rounded-md border border-border !bg-[#0D0D12] !m-0 !my-4 text-[0.85em] shadow-lg shadow-black/20"
            />
          ) : (
            <code {...rest} className="bg-muted text-primary px-1.5 py-0.5 rounded-[0.2rem] font-mono text-[0.9em] border border-border/50">
              {children}
            </code>
          );
        },
        a: ({node, ...props}) => <a {...props} className="text-primary hover:underline decoration-primary/50 underline-offset-2" target="_blank" rel="noopener noreferrer" />,
        p: ({node, ...props}) => <p {...props} className="mb-4 last:mb-0 leading-relaxed text-[0.95rem]" />,
        ul: ({node, ...props}) => <ul {...props} className="list-disc pl-5 mb-4 space-y-1 text-[0.95rem]" />,
        ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-5 mb-4 space-y-1 text-[0.95rem]" />,
        h1: ({node, ...props}) => <h1 {...props} className="text-xl font-bold mb-4 mt-6 text-foreground" />,
        h2: ({node, ...props}) => <h2 {...props} className="text-lg font-bold mb-3 mt-5 text-foreground" />,
        h3: ({node, ...props}) => <h3 {...props} className="text-md font-bold mb-2 mt-4 text-foreground" />,
      }}
      className="prose prose-invert max-w-none text-foreground/90 font-mono break-words"
    >
      {content}
    </ReactMarkdown>
  );
}
