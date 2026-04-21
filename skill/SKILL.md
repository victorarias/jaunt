---
name: pr-tour
description: Generate a `.pr-tour-guide.yml` reading-order file for a GitHub PR so Victor can review it in the pr-tour app in a curated order with inline notes. Use when the user asks to build a PR tour, generate a reading order, make a pr-tour guide, or says "/pr-tour".
---

# pr-tour

Produces `.pr-tour-guide.yml` in the current working directory — a curated reading order with per-file notes that the local pr-tour app (`~/projects/pr-tour`) consumes.

## PR ref resolution

Accept any of these forms as input; if none is given, resolve implicitly.

| Input                                             | Resolution                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `349`                                             | PR #349 in the current repo (via `gh pr view 349 --json ...`)                                   |
| `owner/repo#349` / `owner/repo/349`               | Specific repo + number                                                                          |
| `https://github.com/owner/repo/pull/349`          | Full URL                                                                                        |
| *(no argument)*                                   | PR of the current branch — `gh pr view --json number,headRepository,headRepositoryOwner` (must be run in the target repo's cwd; don't assume the pr-tour cwd is the repo) |

If no PR exists for the current branch, stop and tell the user. Do not invent a ref.

**Important:** `gh pr view` operates on the cwd's repo. If the user ran `/pr-tour` from a project directory (e.g. `~/projects/huxie`), run gh from there — not from the pr-tour app directory.

## What you produce

A single `.pr-tour-guide.yml` in the cwd, shape:

```yaml
version: 1

summary: |
  Two-to-four lines telling the reader the reading strategy —
  the "why" of this PR and where to start.

files:
  - path: docs/plans/2026-04-18-foo.md
    view: content                      # optional, default "diff"
    note: Ground truth. Decision tables (DT-*), invariants (INV-*).
    annotations:
      - anchor: "## Decision table 2"  # pin a note to a line
        note: The service enforces these pair rules.
      - anchor: "INV-5"
        note: First-writer-wins — load-bearing invariant for the whole PR.

  - path: server/internal/foo/model.go
    note: |
      The Foo aggregate. Enums first — everything keys off these.
    annotations:
      - anchor: "type Status"
        note: The status enum the rest of the system keys off.

skip:
  - server/internal/platform/postgres/sqlcgen/queries.sql.go
  - server/internal/platform/postgres/sqlcgen/models.go
```

`files` entries appear in order, numbered, with notes above the diff. Files not in `files` or `skip` appear under "Other files". `skip` entries appear last, dimmed.

**Per-file options:**
- `view: diff` (default) or `view: content`. Use `content` for plan/design docs whose diff is all-add and gives no structure — the app renders the full post-PR file with annotations pinned to lines.
- `annotations:` — a list of line-level notes. Each annotation has exactly one location form:
  - `anchor: "..."` (recommended) — first line containing this substring
  - `line: N` — exact line number in the post-PR file
  - `start: N, end: M` — inclusive line range

Prefer `anchor` over exact line numbers — it's more stable against edits and you don't need to re-check line numbers if the file changes.

## Workflow

### 0. How did you get here?

Before anything else, figure out which branch you're on:

- **Same session that authored the PR** — you already have the diff, the decisions, and (usually) the plan docs in context. Skip step 1's gather; you know what's load-bearing. Lean heavily on `thread:` annotations (see 5b) to pre-empt pushback on decisions the reviewer hasn't seen justified — this is the highest-leverage thing you can do, and only you know which choices were contested.

- **Fresh session / not the author** — you know nothing. Do step 1 in full, and also:
  - `gh pr diff <ref>` — read the **entire** diff before writing anything. File lists with add/del counts are not enough to write good notes; notes require knowing what the code does.
  - Read the PR body end-to-end, not just for plan-doc links. The body usually carries the *why* — constraints, tradeoffs, rejected alternatives, open questions. Most of that belongs in your tour summary or per-file notes.
  - For each file you plan to annotate, read the post-PR version in full (fetch with `git show <headSha>:<path>` or from a local checkout of the PR branch). Annotations require knowing where specific invariants/decisions live.
  - If the diff is too large to fit in context: read the plan doc + the file list, pick your candidate tour files first, then pull `gh pr diff <ref> -- <path>` per file as you write that file's note.

### 1. Resolve the PR

```bash
gh pr view <ref> --json number,title,body,url,headRefName,baseRefName,author,commits
gh api --paginate "/repos/<owner>/<repo>/pulls/<n>/files" --jq '.[] | {path: .filename, status, additions, deletions}'
```

Read the PR body in full. Note anything the author flagged as generated (goes to `skip`), anything they called out as load-bearing (goes to `files` with annotations), and anything stated as a tradeoff or open question (goes to the summary). If the body links to a plan/design doc (`docs/plans/*.md`, `docs/design/*.md`), that doc is almost always the first tour entry.

### 2. Understand the shape

Count files. Group by directory/layer (domain / ports / services / adapters / tests / migrations / generated). This shapes everything downstream.

**Small PRs (≤ 8 files):** a tour is often not worth it *if* the change is mechanical (rename, dependency bump, formatting). If the change is small but load-bearing (a new invariant, a subtle race fix), write a short tour with 1–2 annotations — that's where a tour earns its keep. Same-session authors should default to producing the tour; only ask the user if the PR is genuinely trivial.

**Large PRs (30+ files):** a tour earns its keep. Budget your reading — read the plan, the domain model, and a couple of service/test files. Don't read every file; that's what the reviewer is for.

### 3. Decide the reading order

The default shape is **domain-outward**, which matches how someone builds a mental model from concepts → behavior → wiring:

1. Plan/design doc (if present) — ground truth for invariants & decisions
2. Domain model / aggregates / enums (`model.go`, `types.ts`, `domain/`)
3. Inbound + outbound ports / contracts (`ports.go`, interfaces)
4. Service / use-case layer — the behavior (`service.go`)
5. Service-layer tests — the behavior's executable spec
6. Persistence adapter (`postgres.go`, `queries.sql`, migration)
7. Integration test (real DB) — the contract for the SQL/port pairing
8. Realtime / live / eventing adapters if touched
9. Orchestration / synthesis / job processors if touched
10. Thread / gRPC / HTTP wiring
11. End-to-end tests (tenant isolation, full flow)

Adapt for the PR. A frontend-heavy PR reads types → domain modules → components → hooks → route wiring → component tests. An infra PR reads migrations → config → handlers.

### 4. Skip generated files

Always put these under `skip` (they still appear, dimmed; the reviewer can glance without being buried):

- `**/sqlcgen/*.go` (queries.sql.go, models.go, db.go)
- `**/*_pb.go`, `**/*.pb.go` (generated protobuf)
- `website/src/api/gen/**` (generated gRPC-Web clients)
- Lock files if in the diff: `bun.lock`, `package-lock.json`, `go.sum` *(small ones you can leave under Other; only skip if they dominate the list)*
- Snapshot fixtures, golden files if huge

### 5. Write the notes

**Each note answers: "what should the reader pay attention to in this file?"** — not "what does this file do" (the diff shows that).

Good notes reference:
- **Invariants** the file enforces (`INV-5`, `INV-1`)
- **Decision table rows** the file implements (`DT-2`, `DT-3`)
- **Examples** the file realizes (`EX-2`, `EX-9`)
- **Security boundaries** (tenant isolation, idempotency, first-writer-wins)
- **Why this file now** (gives context the diff lacks)
- **Cross-references** ("start here, then follow outward")

Keep notes 1–5 lines. Longer is fine when the file is load-bearing (the service, the plan). Short is fine for thin files (a repository adapter, a gRPC handler).

Bad notes to avoid:
- *"This file defines the Foo struct."* — the diff shows that.
- *"Added new method Bar."* — same.
- *"Refactored to be cleaner."* — the reviewer decides that.

### 5a. Decide `view:` per file

Default `view: diff`. Switch to `view: content` when the diff is not the right frame:

- **Plan / design docs** (`docs/plans/*.md`, `docs/design/*.md`) — usually all-add; the reader wants to read the document, not a diff of it
- **New large reference docs** — same reasoning
- **Long new config files or schemas** where the structure matters more than the add markers

Do NOT switch to `content` for:
- Code files (always `diff` — the reviewer wants to see what changed)
- Small doc changes (the diff is small and useful)
- Renamed or moved files (diff shows the rename)

### 5b. Add line-level annotations (optional, but high-leverage)

For load-bearing files, add `annotations:` to pin 1–5 notes to specific lines. This is where the tour adds the most value: it tells the reader *exactly* where the important stuff is instead of making them hunt.

**When to annotate:**
- Plan / design doc: pin the status table, the key decision tables, each major invariant
- Service / domain model: pin the function enforcing a decision rule, the enum everything keys off
- Tests: pin the most load-bearing test (e.g. tenant-isolation, first-writer-wins)

**Anchor syntax (prefer this):**
```yaml
annotations:
  - anchor: "## Decision table 2"   # substring match; first occurrence
    note: The service enforces these pair rules.
  - anchor: "func (s *Service) Resolve"
    note: First-writer-wins lives here (INV-5).
```

Pick anchors that are distinctive and unlikely to appear twice — heading text, function signatures, specific constants. The anchor just needs to be a substring of some line; leading/trailing whitespace in the line is fine.

**Verify every anchor before you commit to it.** The resolver takes the *first* substring match in the post-PR file. After picking an anchor, mentally (or actually) grep the file and confirm the first hit is the line you mean. If there's any risk of ambiguity — e.g. `"func Resolve"` when both `Resolve` and `ResolveAsync` exist, or a heading repeated across sections — lengthen the anchor to include surrounding tokens (`"func (s *Service) Resolve("` or `"## Decision table 2 — pair rules"`). A wrong-line anchor silently pins to the wrong place; the app can't warn you.

**Line numbers** (`line: N` or `start: N, end: M`) work too, but prefer anchors — they survive file edits. Reach for `line:` only when there's no distinctive text to anchor on. Use `start:+end:` when the annotation covers a block you want highlighted together (a transaction, a state machine, a Lua script), not a single line.

**Keep annotation notes short** (1–2 lines). Long explanation belongs in the file-level note. An annotation is a pin: "look here, because X".

#### Thread form — anticipate pushback

When a decision is likely to draw a "why not X?" reply, use `thread:` instead of `note:`. Each thread is a mini conversation pinned to a line — the first comment states the concern, subsequent comments pre-empt the likely counter-argument:

```yaml
- anchor: "func (s *Service) Resolve"
  thread:
    - "First-writer-wins enforced here (INV-5) — the CAS is load-bearing."
    - author: claude[bot]
      body: |
        Considered retry-on-conflict; rejected because it breaks idempotency
        when the caller is a webhook.
```

Items are either bare strings (agent-authored) or `{author, body}` mappings.

**This is the highest-leverage annotation form for same-session authors.** You already know which choices were contested, which alternatives you rejected, and why. Surfacing the rejected alternative in a follow-up comment saves the reviewer a round-trip ("why didn't you just…?"). Use `thread:` whenever:
- You picked an option that isn't the obvious default
- A constraint (legal, perf, compat) forced your hand and isn't visible in the diff
- You're deferring a concern to a follow-up PR

For fresh-session reviewers, use `thread:` more sparingly — you don't know the rejected alternatives, so single-comment `note:` is usually honest.

### 6. Write the summary

Three to five lines. Tell the reviewer:
- **What this PR is** in one phrase ("PR 2 of 3 for background tool calls")
- **The reading strategy** in shorthand ("Read domain-outward: plan → aggregate → ports → service → persistence → realtime → synthesis → wiring → tests.")
- Anything that would surprise them ("Generated files are at the bottom under Skipped.")

### 7. Write the file

Write `.pr-tour-guide.yml` in the cwd (not in the pr-tour app directory; the reviewer runs pr-tour from the PR's repo or wherever they prefer). Do not overwrite a non-empty existing `.pr-tour-guide.yml` without asking.

### 8. Validate

After writing, run:

```bash
pr-tour validate
```

Useful variants: `pr-tour validate --offline` (schema-only — no `gh` calls) and `pr-tour validate --pr <ref>` (check against a specific PR instead of the current branch's).

It parses the YAML with the same loader the app uses, then reports:

- **Errors** (exit non-zero) — schema problems, paths in `files` not in the PR, anchors that don't resolve, `line:` / `end:` past end of file, a path listed in both `files` and `skip`, duplicate `files` entries. Fix and re-run until `validate` is clean.
- **Warnings** — ambiguous anchors (first substring match wins; lengthen if that's not what you want), `skip:` entries not in the PR, very short anchors, `view: content` on files the app can't fetch. Act on these unless you have a specific reason not to.

**Do not improvise your own YAML validation** (no `python -c "import yaml..."`, no inline scripts, no eyeballing the file yourself). `pr-tour validate` is the contract — it catches everything the app will silently misinterpret, and it's the one source of truth. If `pr-tour` isn't on `$PATH`, run `cd ~/projects/pr-tour && bun run src/cli.ts validate [guide-path]` from the target repo's directory (pass the guide path explicitly since cwd will be the pr-tour repo).

### 9. Report

Tell the user:
- The file you wrote and where
- Count of tour / other / skip entries
- The `pr-tour validate` result (clean / N warnings)
- The command to launch the review: `pr-tour <pr-ref>` (or `cd ~/projects/pr-tour && bun run start <pr-ref>` if not globally installed)

## Edge cases

- **No plan doc, no design doc:** the first tour entry is the domain model (model.go, types.ts).
- **Pure test PR:** reading order is the test file itself, then helpers it uses.
- **Pure refactor with no new concepts:** a tour is low value. Offer to skip and just rely on "Other files" order.
- **Generated files dominate (e.g. 200 lines of human code, 5000 lines of generated):** skip everything generated; summary should tell the reviewer the generated churn is ignorable.
- **Repo is not the cwd:** the PR lives in a different repo from where pr-tour will run. Generate the guide in the PR's repo (so paths are relative to that repo's files), not in the pr-tour directory.

## Do not

- Invent files or line references you didn't verify.
- Paraphrase the diff in notes — the reader can see it.
- Write a 20-line note on a 5-line change.
- Skip reading the diff on a fresh session just because the file list looks familiar. File names ≠ content.
- Pick ambiguous anchors and hope the first match is right. Verify, or lengthen.
- Write your own YAML validator. Use `pr-tour validate` — it catches exactly what the app would silently misinterpret.
- Overwrite an existing `.pr-tour-guide.yml` that has substantial content without asking.
- Post the guide to GitHub — this skill is local-file only. (Posting to a pinned PR comment is a future feature.)
