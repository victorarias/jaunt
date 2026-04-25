import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { MermaidBlock } from "./MermaidBlock.tsx";

type Props = {
  source: string;
  className?: string;
};

function MarkdownImpl({ source, className }: Props) {
  return (
    <div className={`md ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          code: ({ node: _node, className, children, ...props }) => {
            const lang = /language-([\w-]+)/.exec(className ?? "")?.[1];
            const isFenced = Boolean(lang);
            if (lang === "mermaid") {
              return <MermaidBlock source={String(children).replace(/\n$/, "")} />;
            }
            if (isFenced) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="md-inline" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node: _node, children, ...props }) => {
            // Skip the default <pre> wrapper for mermaid so the diagram sits
            // in flow rather than inside a code block.
            const child = Array.isArray(children) ? children[0] : children;
            if (
              child &&
              typeof child === "object" &&
              "props" in child &&
              (child.props as { className?: string }).className?.includes(
                "language-mermaid",
              )
            ) {
              return <>{children}</>;
            }
            return <pre {...props}>{children}</pre>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
