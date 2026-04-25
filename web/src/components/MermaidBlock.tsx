import { useEffect, useRef, useState } from "react";

type State =
  | { kind: "loading" }
  | { kind: "ok"; svg: string }
  | { kind: "error"; message: string };

let counter = 0;
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "var(--mono)",
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

type Props = { source: string };

export function MermaidBlock({ source }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const idRef = useRef<string>(`mermaid-${++counter}`);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getMermaid()
      .then(async (mermaid) => {
        // Always parse before render. parse() throws cleanly on a bad
        // diagram; render() leaves a stray "bomb" error SVG attached to the
        // document body that we'd have no way to garbage-collect.
        try {
          await mermaid.parse(source);
        } catch (err) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
        // mermaid.render mutates a hidden DOM node by id; force a fresh id on
        // every re-render so concurrent edits don't collide.
        const id = `${idRef.current}-${++counter}`;
        try {
          const { svg } = await mermaid.render(id, source);
          if (!cancelled) setState({ kind: "ok", svg });
        } catch (err) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  if (state.kind === "loading") {
    return <div className="mermaid-block loading">Rendering diagram…</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="mermaid-block error">
        <div className="mermaid-error-head">Mermaid render failed</div>
        <pre>{state.message}</pre>
        <details>
          <summary>diagram source</summary>
          <pre>{source}</pre>
        </details>
      </div>
    );
  }
  return (
    <div
      className="mermaid-block"
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
