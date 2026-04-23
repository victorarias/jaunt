---
name: pr-tour
description: Generate a `.pr-tour-guide.yml` reading-order file for a GitHub PR so Victor can review it in the pr-tour app in a curated order with inline notes, then launch the app. Use when the user asks to build a PR tour, generate a reading order, make a pr-tour guide, says "/pr-tour", or asks to "open the tour" / "open it" after a tour has been created.
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

summary: >
  Two-to-four lines telling the reader the reading strategy —
  the "why" of this PR and where to start.

files:
  - path: docs/plans/2026-04-18-foo.md
    view: content                      # optional, default "diff"
    note: Start here. DT-* are the decision tables, INV-* the invariants. The service implements these literally.
    annotations:
      - anchor: "## Decision table 2"  # pin a note to a line
        note: The pair rules. If it's not in this table, the service rejects it.
      - anchor: "INV-5"
        note: First-writer-wins. Everything else in the service assumes this holds.

  - path: server/internal/foo/model.go
    note: >
      The aggregate. Start with the enums — the rest just switches on them.
    annotations:
      - anchor: "type Status"
        note: The state machine in three lines. Worth reading before the service.

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

### YAML authoring: `>` for prose, `|` for structure

This bites often enough to deserve its own callout. When a `note:` or thread-item body is more than one line of prose, use a **folded** block (`>`), not a **literal** block (`|`):

```yaml
# Good: folded. Single newlines collapse to spaces; the reader sees one
# flowing paragraph that the browser wraps to its own width.
note: >
  Went back and forth on retry-on-conflict — dropped it in the end
  because it breaks idempotency when the caller's a webhook, and here
  it almost always is.

# Bad: literal. Every newline you typed becomes a visible <br> in the
# rendered comment, so hard-wrapping at ~80 cols for YAML readability
# leaks into the UI as a stack of short lines.
note: |
  Went back and forth on retry-on-conflict — dropped it in the end
  because it breaks idempotency when the caller's a webhook, and here
  it almost always is.
```

Rule of thumb:
- **`>` (folded)** — prose. Wrap your YAML freely at ~80 cols for readability; the UI sees one paragraph. Use this for almost every multi-line `note:`, `summary:`, and thread item.
- **`|` (literal)** — the linebreaks mean something. A bulleted list typed one-per-line, a short code block, ASCII art. Rare.
- **Single-quoted or double-quoted string** — a short note that fits on one line. Simplest; no block scalar needed.

Both `>` and `|` treat a blank line as a paragraph break — so `>` still lets you write multi-paragraph notes, you just use `\n\n` to separate paragraphs and let single newlines collapse to spaces.

## Voice

The tour is **pedagogic** — it walks a reviewer through *your* mental model so they arrive where you already are. Assume they're smart but haven't seen this PR before; don't assume they know the codebase's conventions, the plan doc, or the constraints that shaped the design.

Four rules of thumb, in order:

1. **Teach, don't list.** Notes should build understanding, not enumerate changes. "Enums first — the rest of the system keys off these states" teaches. "Adds Status and Priority enums" lists. The diff lists already. Line-pinned annotations have a sharper version of this rule — see step 5b.
2. **Be concise.** Pedagogic is not the same as thorough. A note that takes 5 lines to say what 2 would is worse than the 2-line version, not better. Short sentences. No filler ("basically", "essentially", "it's worth noting that"). If you can delete a sentence without losing meaning, delete it.
3. **Assume a smart reader.** No hand-holding on standard patterns (what a repository adapter does, what an HTTP handler looks like). Explain what's *non-obvious* — the invariant, the tradeoff, the constraint you bowed to — and trust the reviewer on the rest.
4. **Sound like a friendly engineer, not a textbook.** You're writing for a teammate, not an audience — think senior engineer who actively wants the reviewer to *get it*, not one showing off how tight the code is. Loose register. Contractions. First person where it helps (*"I almost went the other way here"*, *"you'll probably wonder about the retry loop — it got messy, had to be"*). Little asides when a decision is weird or annoying are good; so is meeting the reader where they are (*"if you've read the plan, this'll be familiar"*). What to avoid: stiff openers (*"This module provides..."*, *"The purpose of this file is..."*), smugness, and cold one-line pronouncements (*"Use this. Don't simplify."*) that shut the reader down. A good note reads like how you'd walk a teammate through the PR on a good day — confident, casual, generous with context.

A good tour feels like a sharp colleague walking you through the codebase at a whiteboard. A bad tour feels like a compliance checklist.

## Workflow

### 0. How did you get here?

Before anything else, figure out which branch you're on:

- **Same session that authored the PR** — you already have the diff, the decisions, and (usually) the plan docs in context. Skip step 1's gather; you know which choices were contested and which lines enforce them. Lean heavily on `thread:` annotations (see 5b) to pre-empt pushback on decisions the reviewer hasn't seen justified — this is the highest-leverage thing you can do, and only you know which choices were contested.

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

Read the PR body in full. Note anything the author flagged as generated (goes to `skip`), anything they called out as consequential or non-obvious (goes to `files` with annotations), and anything stated as a tradeoff or open question (goes to the summary). If the body links to a plan/design doc (`docs/plans/*.md`, `docs/design/*.md`), that doc is almost always the first tour entry.

### 2. Understand the shape

Count files. Group by directory/layer (domain / ports / services / adapters / tests / migrations / generated). This shapes everything downstream.

**Small PRs (≤ 8 files):** a tour is often not worth it *if* the change is mechanical (rename, dependency bump, formatting). If the change is small but consequential (a new invariant, a subtle race fix), write a short tour with 1–2 annotations — that's where a tour earns its keep. Same-session authors should default to producing the tour; only ask the user if the PR is genuinely trivial.

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

Follow the **Voice** principles above. Each note answers: *"what should the reader pay attention to in this file, and why?"* — not "what does this file do" (the diff shows that).

Good notes reference:
- **Invariants** the file enforces (`INV-5`, `INV-1`)
- **Decision table rows** the file implements (`DT-2`, `DT-3`)
- **Examples** the file realizes (`EX-2`, `EX-9`)
- **Security boundaries** (tenant isolation, idempotency, first-writer-wins)
- **Why this file now** (gives context the diff lacks)
- **Cross-references** ("start here, then follow outward")

**Length**: 1–3 lines is the sweet spot. Up to 5 for a file the PR hinges on (the service, the plan). A one-line note is fine for a thin file — don't pad. If you find yourself writing a paragraph, you're probably restating the diff.

Bad notes to avoid:
- *"This file defines the Foo struct."* — the diff shows that.
- *"Added new method Bar."* — same.
- *"Refactored to be cleaner."* — the reviewer decides that.
- *"This module is responsible for handling..."* — boilerplate opener; cut to the teaching point.
- *"The code comment says X"* / *"As the docstring notes..."* — repeating text the reader already sees isn't a note; give the reason the line matters.

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

For the files that carry the design (the service, the plan doc, the aggregate that everything keys off), add `annotations:` to pin 1–5 notes to specific lines. This is where the tour adds the most value: it tells the reader *exactly* where the important stuff is instead of making them hunt.

**An annotation is a pin, not a transcript.** The reader already sees the anchored line right above your note — the app renders it inline. So the annotation must never copy the line back at them: don't paste the function signature, don't echo the inline code comment, don't paraphrase the plan-doc paragraph the pin sits inside. That's wasted ink. Use the note for context the line doesn't carry — *why* this line matters, the invariant it enforces, the constraint that forced this shape, the downstream behavior that hinges on it. This rule bites hardest on plan docs: the plan is already well-written prose, so an annotation that restates it adds nothing. If the line already says everything that needs saying, don't pin it.

**When to annotate:**
- Plan / design doc: pin the status table, the key decision tables, each major invariant
- Service / domain model: pin the function enforcing a decision rule, the enum everything keys off
- Tests: pin the most critical test (e.g. tenant-isolation, first-writer-wins)

**Anchor syntax (prefer this):**
```yaml
annotations:
  - anchor: "## Decision table 2"   # substring match; first occurrence
    note: The pair rules. If it's not in this table, the service rejects it.
  - anchor: "func (s *Service) Resolve"
    note: First-writer-wins lives here (INV-5). The CAS is what actually enforces it.
```

Pick anchors that are distinctive and unlikely to appear twice — heading text, function signatures, specific constants. The anchor just needs to be a substring of some line; leading/trailing whitespace in the line is fine.

**Verify every anchor before you commit to it.** The resolver takes the *first* substring match in the post-PR file. After picking an anchor, mentally (or actually) grep the file and confirm the first hit is the line you mean. If there's any risk of ambiguity — e.g. `"func Resolve"` when both `Resolve` and `ResolveAsync` exist, or a heading repeated across sections — lengthen the anchor to include surrounding tokens (`"func (s *Service) Resolve("` or `"## Decision table 2 — pair rules"`). A wrong-line anchor silently pins to the wrong place; the app can't warn you.

**Line numbers** (`line: N` or `start: N, end: M`) work too, but prefer anchors — they survive file edits. Reach for `line:` only when there's no distinctive text to anchor on. Use `start:+end:` when the annotation covers a block you want highlighted together (a transaction, a state machine, a Lua script), not a single line.

**Keep annotation notes short** (1–2 lines). Long explanation belongs in the file-level note.

#### Thread form — anticipate pushback

When a decision is likely to draw a "why not X?" reply, use `thread:` instead of `note:`. Each thread is a sequence of comments pinned to a line — the first one states the point, subsequent ones pre-empt the likely counter-argument:

```yaml
- anchor: "func (s *Service) Resolve"
  thread:
    - "First-writer-wins lives here (INV-5). The CAS is what actually enforces it."
    - >
      Went back and forth on retry-on-conflict — dropped it in the end
      because it breaks idempotency when the caller's a webhook, and here
      it almost always is.
```

**Default to bare strings.** Both bubbles are authored by *you* (the agent writing the tour), so both render under the same "agent" byline — that's correct. Do not use `{ author: claude[bot], body: ... }` to make the follow-up feel like a second voice; it's the same voice, and a split byline makes the thread read like a two-person dialogue when it isn't. Two bubbles already give the visual separation.

Only reach for `{author, body}` when you're quoting a genuinely different voice — e.g., the PR author's own words from the description, or a past reviewer's comment you want to preserve context on.

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

### 9. Ask the user how to run it

Before launching, ask the user one short question:

> *"fire-and-forget (just open it for you), or should I wait for your review and act on the feedback?"*

There's no sensible default here — the two modes have very different implications for what you do next, and guessing wrong wastes the user's time.

- **fire-and-forget** — the user wants the tour; your job ends once the app is up.
- **await-and-act-on-feedback** — the user wants you to block until they submit and then incorporate their comments. This matches phrasings like *"review this PR and address my comments"*, *"wait for my feedback"*, *"when I'm done let me know what you'll change"*.

Don't re-ask if the user's original request already made the mode obvious (*"build a tour, then come back and fix the things I flag"* is unambiguously await-and-act).

### 10. Launch the app

Start the server yourself — don't leave it as a command for the user to copy.

```bash
pr-tour <pr-ref>                   # user's own machine; auto-opens browser
pr-tour <pr-ref> --host            # remote dev (ssh, codespace, sandbox);
                                   # prints http://<hostname>:5174/, no auto-open
pr-tour <pr-ref> --port 5174       # bind a specific port (see re-launch below)
```

If `pr-tour` isn't on `$PATH`, fall back to `cd ~/projects/pr-tour && bun run start <pr-ref>` (same flags apply).

**Always launch pr-tour as a backgrounded task.** pr-tour is a long-running server that only exits on submit (or Ctrl-C). A normal blocking Bash call will hang and you'll never see the URL to report — that's a dead end in both modes. Whatever your shell tool's "run in background" affordance is (e.g. `run_in_background: true`), use it. Both fire-and-forget and await-and-act-on-feedback background the same way; they only differ in what you do *after* the server is up.

**Startup sentinel** — on bind, pr-tour prints:

```
pr-tour: LISTENING port=5174 url=http://localhost:5174/
```

Immediately after launching, tail the backgrounded task's output until you see that `LISTENING` line (a few seconds, tops). Extract `port=` and `url=` from it — **do not guess or assume the port** (Vite falls back to 5174, 5175, … if 5173 is taken; you'd report the wrong one). The URL you tell the user comes straight from the `url=` value. If you don't see `LISTENING` within ~10s, surface whatever error the output shows.

**Submit sentinel + exit** — when the reviewer clicks Submit, pr-tour prints one of these and then exits `0`:

```
pr-tour: FEEDBACK_READY path=/home/victor/.pr-tour/owner_repo_123.feedback.md
pr-tour: REVIEW_POSTED url=https://github.com/owner/repo/pull/123#...
```

#### Spawn shape

Both modes: background the launch, tail for `LISTENING`, report the URL. After that:

- **fire-and-forget**: done. The backgrounded process will exit on its own when the user submits; you don't need to watch for it.

- **await-and-act-on-feedback**: start watching the task output for a second sentinel — `FEEDBACK_READY` or `REVIEW_POSTED` — or for the process to exit. Use a monitor/watch tool if your environment has one; otherwise poll the output at a slow cadence (don't hot-loop — the user's review takes minutes). When it fires:
  1. `FEEDBACK_READY`: read `~/.pr-tour/<owner>_<repo>_<num>.feedback.md`, act on the feedback. After you're done, **re-launch on the same port**: `pr-tour <ref> --port <N>` where `<N>` is the port from the original `LISTENING` line (again as a backgrounded task, again tail for the new `LISTENING`). Tell the user the server's back up and to refresh their browser tab to see the updated code and leave follow-up comments.
  2. `REVIEW_POSTED`: user submitted to GitHub directly — acknowledge, no local action, do not re-launch.
  3. Long silence (tens of minutes, no exit): the user probably closed the browser without submitting. Ask before killing — don't assume abandonment.

The re-launch makes the loop feel continuous: same URL, user refreshes, drafts are fresh (they were cleared on submit), and the new process picks up whatever commits you just made.

**"Open the tour" / "open it" means launch the app.** The YAML is an internal artifact — the user never wants you to cat / Read / open the `.pr-tour-guide.yml` file itself, even when their request is that terse. Their tour *is* the running web page. So: when the user asks to "open the tour", "open it", "show me", or any similar verbage after a tour has been created, spawn `pr-tour <ref>` (with `--host` as appropriate) — don't display the YAML. If the app is already running, tell them the URL; don't restart.

**Heads up: the tour is loaded once at startup.** If you (or the user) edit `.pr-tour-guide.yml` after launching, the running server won't pick up the change — kill it (Ctrl-C) and re-run `pr-tour <pr-ref>`. Tell the user this when you report, so they don't wonder why a tweak isn't showing up.

### 11. Report

Tell the user, tersely:
- The file you wrote and where
- Count of tour / other / skip entries
- The `pr-tour validate` result (clean / N warnings)
- The URL the app is serving at (localhost, or the remote hostname if you used `--host`)
- The "re-run if the YAML changes" reminder

## Edge cases

- **No plan doc, no design doc:** the first tour entry is the domain model (model.go, types.ts).
- **Pure test PR:** reading order is the test file itself, then helpers it uses.
- **Pure refactor with no new concepts:** a tour is low value. Offer to skip and just rely on "Other files" order.
- **Generated files dominate (e.g. 200 lines of human code, 5000 lines of generated):** skip everything generated; summary should tell the reviewer the generated churn is ignorable.
- **Repo is not the cwd:** the PR lives in a different repo from where pr-tour will run. Generate the guide in the PR's repo (so paths are relative to that repo's files), not in the pr-tour directory.

## Do not

- Invent files or line references you didn't verify.
- Paraphrase the diff in notes — the reader can see it.
- Transcribe the anchored line into its annotation. Copying the function signature, the inline code comment, or a paragraph from a plan doc wastes the pin — the reader already sees the line. Annotations add *why*, not *what*.
- Write a 20-line note on a 5-line change.
- Skip reading the diff on a fresh session just because the file list looks familiar. File names ≠ content.
- Pick ambiguous anchors and hope the first match is right. Verify, or lengthen.
- Use `|` (literal block) for prose with hard-wrapped lines. The newlines render as visible `<br>`s in the comment bubble. Use `>` (folded) — see the YAML-authoring callout above.
- Write your own YAML validator. Use `pr-tour validate` — it catches exactly what the app would silently misinterpret.
- Overwrite an existing `.pr-tour-guide.yml` that has substantial content without asking.
- Post the guide to GitHub — this skill is local-file only. (Posting to a pinned PR comment is a future feature.)
