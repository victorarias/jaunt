# pr-tour

A local web app for reviewing GitHub PRs in a curated order with inline notes, synced back to the PR as a single review comment.

## Status: v0.3

- File-level notes
- Line-level annotations (anchor, line, or start+end range) pinned to the diff
- Per-file `view: diff | content` mode — plan docs can render their full text with pins instead of the diff
- One-way push-and-clear sync
- Tour YAML ingestion (local file)

## Quick start

```bash
cd ~/projects/pr-tour
bun install
bun run start https://github.com/owner/repo/pull/349
```

A browser tab opens with:
- **Top bar** — PR title, progress counter, "Push review to GitHub" button, save indicator
- **Sidebar** — overall review note, tour summary, file list grouped by tour/other/skipped
- **Main** — selected file's diff (shiki-highlighted), tour note above the diff, reviewed checkbox, per-file note textarea

Notes autosave to `~/.pr-tour/<owner>_<repo>_<num>.json` (400ms debounce).

## CLI argument forms

```
pr-tour <pr-ref> [--guide <path>] [--no-guide]
```

- `349` — number; uses the current `gh` repo
- `owner/repo#349`
- `owner/repo/349`
- `https://github.com/owner/repo/pull/349`

## Tour guide format

If a `.pr-tour-guide.yml` (or `.yaml`) file exists in the cwd, it's applied automatically. Pass `--guide <path>` for a custom location, or `--no-guide` to ignore.

```yaml
version: 1

summary: |
  Optional prose intro shown in the sidebar — the "why" of this PR.
  Tell the reviewer the reading strategy: "start at X, note Y, Z is generated."

files:
  - path: docs/plans/foo.md
    view: content                      # default: diff — use "content" for plan/design docs
    note: Ground truth — decision tables and invariants.
    annotations:
      - anchor: "## Decision table 2"  # substring match; first occurrence
        note: The service enforces these pair rules.
      - anchor: "INV-5"
        note: First-writer-wins is the load-bearing invariant here.

  - path: server/internal/background/service.go
    note: OpenCall / Resolve — the behavior.
    annotations:
      - line: 145                      # exact line number in the post-PR file
        note: DT-2 pair-rule enforcement entry point.
      - start: 200
        end: 230
        note: First-writer-wins block (INV-5).

skip:
  - server/internal/platform/postgres/sqlcgen/queries.sql.go
  - server/internal/platform/postgres/sqlcgen/models.go
```

**Semantics**
- `files` entries appear first, in order, numbered, with their `note` shown above the diff
- Files not in `files` or `skip` appear next under "Other files"
- `skip` entries appear last under "Skipped", dimmed — nothing is ever hidden
- `view: content` renders the full post-PR file (syntax-highlighted) instead of the diff — useful for plan/design docs whose diff is all-add and gives no structure
- `annotations` pin notes to specific lines:
  - `anchor: "..."` — first line containing this substring (recommended; stable across edits)
  - `line: N` — exact line number in the post-PR file
  - `start: N, end: M` — inclusive line range
  - annotations resolve against the full post-PR file; in `diff` mode they're pinned to the matching diff row (or listed under "Annotations outside the diff" if the line isn't in any hunk)
- Paths referenced by the guide that don't match any PR file become a warning in the sidebar
- Currently the tour is loaded once at startup; restart the server after editing the guide

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

After success, the local draft is cleared.

## Not yet built

- A Claude skill that auto-generates `.pr-tour-guide.yml` for a given PR
- Posting/fetching the tour as a pinned PR comment (so reviewers share the same reading order)
- Keyboard shortcuts (j/k/r/⌘↵)
- Filter/search across files
- Line-level comments (file-level only at v1)
- Two-way sync (pulling existing GH threads back in)
