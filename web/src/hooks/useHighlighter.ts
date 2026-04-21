import { useEffect, useState } from "react";
import {
  createHighlighter,
  type HighlighterGeneric,
  type BundledLanguage,
  type BundledTheme,
} from "shiki";

const THEME: BundledTheme = "github-dark";

const LANGS: BundledLanguage[] = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "go",
  "python",
  "rust",
  "java",
  "kotlin",
  "ruby",
  "php",
  "c",
  "cpp",
  "csharp",
  "swift",
  "markdown",
  "json",
  "yaml",
  "toml",
  "bash",
  "sql",
  "html",
  "css",
  "scss",
  "less",
  "ini",
  "xml",
  "docker",
  "makefile",
  "proto",
  "mdx",
];

export type Highlighter = HighlighterGeneric<BundledLanguage, BundledTheme>;

let cached: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!cached) {
    cached = createHighlighter({ themes: [THEME], langs: LANGS });
  }
  return cached;
}

export function useHighlighter(): Highlighter | null {
  const [h, setH] = useState<Highlighter | null>(null);
  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((hl) => {
      if (!cancelled) setH(hl);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return h;
}

export const HIGHLIGHT_THEME = THEME;

export function resolveLang(lang: string | null): BundledLanguage | "plaintext" {
  if (!lang) return "plaintext";
  return (LANGS as string[]).includes(lang)
    ? (lang as BundledLanguage)
    : "plaintext";
}
