# pr-tour

A local web app for reviewing GitHub PRs in a curated order with inline notes, synced back to the PR as a single review comment.

## Status: v0 (file-level notes, one-way push-and-clear sync)

## Quick start

```bash
cd ~/projects/pr-tour
bun install
bun run start https://github.com/owner/repo/pull/349
```

A browser tab opens with:
- **Top bar** — PR title, progress counter, "Push review to GitHub" button, save indicator
- **Sidebar** — overall review note + file list with reviewed state
- **Main** — selected file's diff (with shiki syntax highlighting), reviewed checkbox, per-file note textarea

Notes are auto-saved to `~/.pr-tour/<owner>_<repo>_<num>.json` on change.

## CLI argument forms

- `bun run start 349` — from inside a gh-aware repo dir
- `bun run start owner/repo#349`
- `bun run start https://github.com/owner/repo/pull/349`

## Push-and-clear semantics

Hitting "Push review to GitHub" posts a single review comment with:

```
{overall review note}

---

### Notes by file

**path/to/foo.ts**
{per-file note}

**path/to/bar.ts**
{per-file note}
```

After success the local draft is cleared.

## Not yet built

- Reading-order tour ingestion (from PR comment or local file) — currently files appear alphabetically
- Line-level comments (file-level only at v1)
- Two-way sync (pulling existing GH threads back in)
- Keyboard shortcuts (j/k/r/⌘↵)
