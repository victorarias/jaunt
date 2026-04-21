# pr-tour

A local web app for reviewing GitHub PRs in a curated order with inline notes, synced back to the PR as a single review comment.

## Status: v0.5

- File-level notes
- Line-level annotations (anchor, line, or start+end range) pinned to the diff
- Per-annotation threads: agent-authored comment chains + per-user reply drafts
- Per-file `view: diff | content` mode — plan docs can render their full text with pins instead of the diff
- Stop-based tour UX: summary stop + per-file stops, drive bar with prev/next and a Submit review modal
- Submit target: **GitHub** (posts review comment) or **back to agent** (writes `~/.pr-tour/<ref>.feedback.md`)
- Verdict: approve / comment / request changes
- Tour YAML ingestion (local file)

## Quick start

```bash
cd ~/projects/pr-tour
bun install
bun run start https://github.com/owner/repo/pull/349
```

### Install as a global `pr-tour` command

The `bin` field in `package.json` exposes `pr-tour` via bun's link mechanism,
so you don't have to type `bun run src/cli.ts` every time:

```bash
bun run link                              # symlinks ~/.bun/bin/pr-tour → ./src/cli.ts
# ensure ~/.bun/bin is on PATH — e.g. in ~/.zshrc:
#   export PATH="$HOME/.bun/bin:$PATH"

pr-tour install-skill                     # installs the /pr-tour Claude skill
pr-tour https://github.com/owner/repo/pull/349

bun run unlink                            # to remove
```

The linked binary runs directly from the repo, so `git pull` picks up updates
with no rebuild. (There is no fully standalone binary — the server embeds a
live Vite dev server that reads from `web/`, so it can't be packaged into a
single self-contained executable without a non-trivial production-server
refactor.)

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
      - line: 312                      # threaded form — multi-comment
        thread:
          - "Atomic path uses a Lua script — INCR + PEXPIRE in one call."
          - author: claude[bot]
            body: |
              Follow-up: if Lua is disallowed, swap for MULTI/EXEC.
              Slightly slower, easier to reason about.

skip:
  - server/internal/platform/postgres/sqlcgen/queries.sql.go
  - server/internal/platform/postgres/sqlcgen/models.go
```

**Semantics**
- `files` entries appear first, in order, numbered, with their `note` shown above the diff
- Files not in `files` or `skip` appear next under "Other files"
- `skip` entries appear last under "Skipped", dimmed — nothing is ever hidden
- `view: content` renders the full post-PR file (syntax-highlighted) instead of the diff — useful for plan/design docs whose diff is all-add and gives no structure
- `annotations` pin one or more comments to specific lines:
  - location — exactly one of:
    - `anchor: "..."` — first line containing this substring (recommended; stable across edits)
    - `line: N` — exact line number in the post-PR file
    - `start: N, end: M` — inclusive line range
  - content — exactly one of:
    - `note: "..."` — single agent-authored comment (shortcut)
    - `thread: [...]` — list of comments. Each item is either a bare string (agent-authored) or a `{ author, body }` mapping
  - the reviewer can type a reply under each thread; replies persist in the local draft and appear in the pushed GitHub review body
  - annotations resolve against the full post-PR file; in `diff` mode they're pinned to the matching diff row (or listed under "Annotations outside the diff" if the line isn't in any hunk)
- Paths referenced by the guide that don't match any PR file become a warning in the sidebar
- Currently the tour is loaded once at startup; restart the server after editing the guide

## Submit flow

Hitting "Submit review" opens a modal with three things to pick:

- **Send to**
  - `GitHub` — posts a single review comment on the PR via `gh`
  - `back to agent` — writes the composed body to `~/.pr-tour/<owner>_<repo>_<num>.feedback.md` so a parent agent that invoked `pr-tour` can pick it up
- **Verdict** — Approve / Comment / Request changes
- **Summary comment** — optional; falls back to the sidebar's overall note

The composed body looks like:

```
**Approve** | **Comment** | **Request changes**

{summary comment}

---

### Notes by file

**path/to/foo.ts**

{per-file note}

_on line 145:_

{reply to that thread}

**path/to/bar.ts**

{per-file note}
```

After success, the local draft (notes + replies) is cleared.

### Agent invocation loop

An agent can drive a review by spawning `pr-tour <ref>`, waiting for the user
to submit with `target=agent`, and then reading the resulting file:

```
~/.pr-tour/<owner>_<repo>_<num>.feedback.md
```

The file starts with a header naming the PR and submission time, followed by
the review body. The draft is cleared on success — re-running the CLI opens a
fresh session.

## Claude Code skill

The repo ships with a `/pr-tour` skill that teaches an agent how to produce a
`.pr-tour-guide.yml` for a given PR — file ordering, per-file notes, line-level
annotations (anchors preferred), and `thread:` forms for pre-empting pushback.
The skill branches explicitly on whether the agent authored the PR in the same
session or is coming to it fresh (in which case it is instructed to read the
full diff and PR body before writing anything).

Install it into `~/.claude/skills/pr-tour/`:

```bash
bun run src/cli.ts install-skill          # or: pr-tour install-skill
bun run src/cli.ts install-skill --force  # overwrite an existing install
```

Source of truth lives at `skill/SKILL.md` in this repo. Re-run with `--force`
after pulling updates.

## Not yet built

- A Claude skill that spawns `pr-tour`, awaits the `agent` feedback file, and threads the reply back into the agent's loop
- Posting/fetching the tour as a pinned PR comment (so reviewers share the same reading order)
- Filter/search across files
- Two-way sync (pulling existing GH threads back in)

## Development

```bash
bun install
bun run typecheck     # tsc --noEmit
bun run test:unit     # fast: composer, parser, handlers, integration e2e
bun run test:ui       # slow: real Chromium + real Vite server (see below)
bun test              # both
bun run check         # typecheck + test:unit (no browser)
```

### Tests

**Unit + integration** (`test/*.test.ts`, 27 tests, ~40ms):
- `compose.test.ts` — review-body composer
- `tour.test.ts` — YAML parsing (legacy `note:` and threaded `thread:` forms) and tour application
- `feedback.test.ts` — feedback-file writer
- `api.test.ts` — api-handler dispatch (GitHub vs agent, cache, error path)
- `e2e.test.ts` — handler-level round-trip: save a draft with a thread reply, submit to agent, assert the feedback file on disk

**UI end-to-end** (`test/browser/*.e2e.test.ts`, 2 tests, ~3s):

Boots the real Vite dev server with fake deps (GitHub is mocked, drafts
and feedback go to a temp dir) and drives Chromium via Playwright through:

- Tour navigation (stop 0 → stop 1 → stop 2, `Start tour` / `Next step`)
- "Mark reviewed on advance" behaviour and the `N/M` Submit button counter
- Inline thread rendering, reply textarea + debounced autosave
- Per-file note textarea + autosave
- Submit modal with target toggle (GitHub / back to agent)
- Agent path: feedback file written to disk with the composed body
- GitHub path: `submitReviewComment` mock called, no feedback file written

The UI test requires Playwright + a Chromium build:

```bash
bunx playwright install chromium   # one-time, ~250 MB, cached in ~/Library/Caches/ms-playwright
```

If the browser isn't installed, `bun run test:ui` will fail; `bun run check`
doesn't touch the browser.
