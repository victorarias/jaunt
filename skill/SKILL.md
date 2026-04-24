---
name: jaunt
description: Generate a `.jaunt-guide.yml` reading-order file for a GitHub PR so the user can review it in the jaunt web app in a curated order with inline notes, then launch the app. Use when the user asks to build a PR tour, generate a reading order, make a jaunt guide, says "/jaunt", or asks to "open the tour" / "open it" after a guide has been created.
---

# jaunt

Produces `.jaunt-guide.yml` in the current working directory — a curated reading order with per-file notes that the local `jaunt` CLI consumes.

## PR ref resolution

Accept any of these forms as input; if none is given, resolve implicitly.

| Input                                             | Resolution                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `349`                                             | PR #349 in the current repo (via `gh pr view 349 --json ...`)                                   |
| `owner/repo#349` / `owner/repo/349`               | Specific repo + number                                                                          |
| `https://github.com/owner/repo/pull/349`          | Full URL                                                                                        |
| *(no argument)*                                   | PR of the current branch — `gh pr view --json number,headRepository,headRepositoryOwner` (must be run in the target repo's cwd) |

If no PR exists for the current branch, stop and tell the user. Do not invent a ref.

**Run gh from the target repo's cwd.** If the user ran `/jaunt` from their project directory (e.g. `~/projects/their-repo`), run gh from there so `gh pr view` operates on the right repo.

## What you produce

A single `.jaunt-guide.yml` in the cwd, shape:

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

This bites often enough to deserve its own callout. For any `note:` or thread-item body that runs more than one line, use a **folded** block (`>`):

```yaml
# Folded. Single newlines collapse to spaces; the reader sees one
# flowing paragraph that the browser wraps to its own width.
note: >
  Went back and forth on retry-on-conflict — dropped it in the end
  because it breaks idempotency when the caller's a webhook, and here
  it almost always is.
```

Rule of thumb:
- **`>` (folded)** — prose. Wrap your YAML freely at ~80 cols for readability; the UI sees one paragraph. Use this for almost every multi-line `note:`, `summary:`, and thread item.
- **`|` (literal)** — the linebreaks are meaningful. A bulleted list typed one-per-line, a short code block, ASCII art. Rare.
- **Single- or double-quoted string** — a short note that fits on one line. Simplest; no block scalar needed.

Both `>` and `|` treat a blank line as a paragraph break — so `>` still supports multi-paragraph notes, you just use `\n\n` to separate paragraphs.

## Voice

The tour is **pedagogic** — it walks a reviewer through *your* mental model so they arrive where you already are. Assume they're smart but haven't seen this PR before; don't assume they know the codebase's conventions, the plan doc, or the constraints that shaped the design.

Four rules of thumb, in order:

1. **Teach, don't list.** Notes should build understanding, not enumerate changes. "Enums first — the rest of the system keys off these states" teaches. "Adds Status and Priority enums" lists. The diff lists already. Line-pinned annotations have a sharper version of this rule — see step 5b.
2. **Be concise.** Pedagogic is not the same as thorough. A note that takes 5 lines to say what 2 would is worse than the 2-line version, not better. Short sentences. No filler ("basically", "essentially", "it's worth noting that"). If you can delete a sentence without losing meaning, delete it.
3. **Assume a smart reader.** No hand-holding on standard patterns (what a repository adapter does, what an HTTP handler looks like). Explain what's *non-obvious* — the invariant, the tradeoff, the constraint you bowed to — and trust the reviewer on the rest.
4. **Sound like a friendly engineer, not a textbook.** You're writing for a teammate, not an audience — think senior engineer who actively wants the reviewer to *get it*, not one showing off how tight the code is. Loose register. Contractions. First person where it helps (*"I almost went the other way here"*, *"you'll probably wonder about the retry loop — it got messy, had to be"*). Little asides when a decision is weird or annoying are good; so is meeting the reader where they are (*"if you've read the plan, this'll be familiar"*). What to avoid: stiff openers (*"This module provides..."*, *"The purpose of this file is..."*), smugness, and cold one-line pronouncements that shut the reader down. A good note reads like how you'd walk a teammate through the PR on a good day — confident, casual, generous with context.

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

**Large PRs (30+ files):** a tour earns its keep. Budget your reading — read the plan, the domain model, and a couple of service/test files. You don't need to read every file; that's what the reviewer is for.

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
- Lock files if in the diff: `bun.lock`, `package-lock.json`, `go.sum` *(small ones can stay under Other; skip only if they dominate the list)*
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

Aim for notes that teach — reference the invariant, the tradeoff, the constraint the reader can't see in the diff. If a note could be replaced by reading the diff itself, it's not pulling its weight.

### 5a. Decide `view:` per file

Default `view: diff`. Switch to `view: content` when the diff is not the right frame:

- **Plan / design docs** (`docs/plans/*.md`, `docs/design/*.md`) — usually all-add; the reader wants to read the document, not a diff of it
- **New large reference docs** — same reasoning
- **Long new config files or schemas** where the structure matters more than the add markers

Keep `view: diff` for:
- Code files — the reviewer wants to see what changed
- Small doc changes — the diff is small and useful
- Renamed or moved files — diff shows the rename

### 5b. Add line-level annotations (optional, but high-leverage)

For the files that carry the design (the service, the plan doc, the aggregate that everything keys off), add `annotations:` to pin 1–5 notes to specific lines. This is where the tour adds the most value: it tells the reader *exactly* where the important stuff is instead of making them hunt.

**An annotation is a pin, not a transcript.** The reader already sees the anchored line right above your note — the app renders it inline. So the annotation adds context the line doesn't carry — *why* this line matters, the invariant it enforces, the constraint that forced this shape, the downstream behavior that hinges on it. If the line already says everything that needs saying, don't pin it.

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

**Verify every anchor before you commit to it.** The resolver takes the *first* substring match in the post-PR file. After picking an anchor, grep the file (mentally or actually) and confirm the first hit is the line you mean. If there's any risk of ambiguity — e.g. `"func Resolve"` when both `Resolve` and `ResolveAsync` exist, or a heading repeated across sections — lengthen the anchor to include surrounding tokens (`"func (s *Service) Resolve("` or `"## Decision table 2 — pair rules"`). A wrong-line anchor silently pins to the wrong place; the app can't warn you.

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

**Default to bare strings.** Both bubbles are authored by *you* (the agent writing the tour), so both render under the same "agent" byline — that's correct. Use `{ author, body }` only when you're quoting a genuinely different voice — e.g., the PR author's own words from the description, or a past reviewer's comment you want to preserve context on.

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

Write `.jaunt-guide.yml` in the cwd (not in the jaunt install directory; the reviewer runs `jaunt` from the PR's repo). If a non-empty `.jaunt-guide.yml` already exists, ask before overwriting.

### 8. Validate

After writing, run:

```bash
bunx @victorarias/jaunt validate
```

Shorthand: if the user has done `bun add -g @victorarias/jaunt` so the `jaunt` binary is on PATH, you can type `jaunt validate` instead — same command. When in doubt, use the `bunx @victorarias/jaunt` form; it always works.

Useful variants: `bunx @victorarias/jaunt validate --offline` (schema-only — no `gh` calls) and `bunx @victorarias/jaunt validate --pr <ref>` (check against a specific PR instead of the current branch's).

It parses the YAML with the same loader the app uses, then reports:

- **Errors** (exit non-zero) — schema problems, paths in `files` not in the PR, anchors that don't resolve, `line:` / `end:` past end of file, a path listed in both `files` and `skip`, duplicate `files` entries. Fix and re-run until `validate` is clean.
- **Warnings** — ambiguous anchors (first substring match wins; lengthen if that's not what you want), `skip:` entries not in the PR, very short anchors, `view: content` on files the app can't fetch. Act on these unless you have a specific reason not to.

`validate` is the contract — it catches everything the app will silently misinterpret. Use it as the source of truth for YAML correctness; schema checks the parser does here are the same ones the app does at runtime.

### 9. Ask the user how to run it

There are two post-launch modes, and there's no sensible default — guessing wrong wastes the user's time:

- **hand-off** — you open the app and step away. The user drives the review solo; your part ends once the URL is up.
- **wait-and-act** — you stay on the hook. When the user ends the review, you read the feedback file and act on it (fix code, reply to threads, reopen the tour on the same port, etc.).

Ask in your own words — don't parrot the mode names. Two sentences, casual: what you're about to do, then the choice. E.g. *"Tour's ready to launch. Want me to hang around and pick up your feedback after you're done, or just open it and let you drive?"* Or *"About to spin up the app — should I wait for your review and handle the comments, or drop you into it and move on?"* The goal is a question that sounds like a teammate asking, not a form field.

Skip the question when the user's original request already made the mode obvious. *"Build a tour, then come back and fix the things I flag"* is unambiguously wait-and-act; *"just give me a tour to read"* is unambiguously hand-off. Re-asking in those cases is noise.

### 10. Launch the app

Start the server yourself — don't leave it as a command for the user to copy.

```bash
bunx @victorarias/jaunt <pr-ref>                # user's own machine; auto-opens browser
bunx @victorarias/jaunt <pr-ref> --host         # remote dev (ssh, codespace, sandbox);
                                                # prints http://<hostname>:5174/, no auto-open
bunx @victorarias/jaunt <pr-ref> --port 5174    # bind a specific port (see re-launch below)
```

Shorthand: if the user has `jaunt` on PATH (via `bun add -g @victorarias/jaunt`), you can drop the `bunx @victorarias/` prefix and type `jaunt <pr-ref>` instead. Same behaviour, same sentinel output — the `jaunt:` prefix in stdout comes from the binary name, not the invocation. When in doubt, use `bunx @victorarias/jaunt` — it always resolves.

**Always launch the server as a backgrounded task.** It's a long-running process that exits when the reviewer ends the review. A normal blocking Bash call will hang and you'll never see the URL to report — that's a dead end in both modes. Whatever your shell tool's "run in background" affordance is (e.g. `run_in_background: true`), use it. Both hand-off and wait-and-act background the same way; they only differ in what you do *after* the server is up.

**Startup sentinel** — on bind, `jaunt` prints:

```
jaunt: LISTENING port=5174 url=http://localhost:5174/
```

Immediately after launching, tail the backgrounded task's output until you see that `LISTENING` line (a few seconds, tops). Extract `port=` and `url=` from it — the URL you tell the user comes straight from the `url=` value. If you don't see `LISTENING` within ~10s, surface whatever error the output shows.

**Submit sentinels + exit** — every time the reviewer submits, `jaunt` prints one of these sentinel lines with a `finish=` suffix. The server exits only when `finish=true` — that's the reviewer ticking "End review after this submit" in the dialog, which is the one signal that actually ends the session:

```
jaunt: FEEDBACK_READY path=~/.jaunt/owner_repo_123.feedback.md finish=false
jaunt: FEEDBACK_READY path=~/.jaunt/owner_repo_123.feedback.md finish=true
jaunt: REVIEW_POSTED url=https://github.com/owner/repo/pull/123#... finish=false
jaunt: REVIEW_POSTED url=https://github.com/owner/repo/pull/123#... finish=true
```

Mid-review submits (`finish=false`) append a new timestamped section to the feedback file; the reviewer can submit multiple rounds before ending. Treat `finish=false` sentinels as informational — the review isn't over.

**Process exit is the authoritative "done" signal.** It only fires after a `finish=true` submit.

#### Spawn shape

Both modes: background the launch, tail for `LISTENING`, report the URL. After that:

- **hand-off**: done. The backgrounded process will exit on its own when the user ends the review; you don't need to watch for it.

- **wait-and-act**: watch the task until **the process exits**. Intermediate `finish=false` sentinel lines are informational only — the review is still in progress. When the process exits (which only happens after a `finish=true` submit), grep the final output for which path it took:
  1. Ended with `FEEDBACK_READY …finish=true`: read `~/.jaunt/<owner>_<repo>_<num>.feedback.md` (which contains every round the reviewer submitted, ordered oldest-first), act on the feedback. After you're done, **re-launch on the same port**: `bunx @victorarias/jaunt <ref> --port <N>` where `<N>` is the port from the original `LISTENING` line (again as a backgrounded task, again tail for the new `LISTENING`). Tell the user the server's back up and to refresh their browser tab to see the updated code and leave follow-up comments.
  2. Ended with `REVIEW_POSTED …finish=true`: user posted the final round to GitHub — acknowledge, no local action, no re-launch needed.
  3. Long silence with no exit: the user is either still reviewing or closed the browser without ending. Ask before killing — don't assume abandonment.

The re-launch makes the loop feel continuous: same URL, user refreshes, drafts are fresh (they were cleared on the final submit), and the new process picks up whatever commits you just made.

**"Open the tour" / "open it" means launch the app.** The YAML is an internal artifact — the user wants the running web page, not the file. So: when the user asks to "open the tour", "open it", "show me", or any similar verbage after a tour has been created, spawn `bunx @victorarias/jaunt <ref>` (with `--host` as appropriate) — launch the app rather than displaying the YAML. If the app is already running, tell them the URL; don't restart.

**Heads up: the tour is loaded once at startup.** If you (or the user) edit `.jaunt-guide.yml` after launching, the running server won't pick up the change — kill it (Ctrl-C) and re-run the launch command. Tell the user this when you report, so they don't wonder why a tweak isn't showing up.

### 11. Report

Tell the user, tersely:
- The file you wrote and where
- Count of tour / other / skip entries
- The `validate` result (clean / N warnings)
- The URL the app is serving at (localhost, or the remote hostname if you used `--host`)
- The "re-run if the YAML changes" reminder

## Edge cases

- **No plan doc, no design doc:** the first tour entry is the domain model (model.go, types.ts).
- **Pure test PR:** reading order is the test file itself, then helpers it uses.
- **Pure refactor with no new concepts:** a tour is low value. Offer to skip and just rely on "Other files" order.
- **Generated files dominate (e.g. 200 lines of human code, 5000 lines of generated):** skip everything generated; summary should tell the reviewer the generated churn is ignorable.
- **Repo is not the cwd:** the PR lives in a different repo from where `jaunt` will run. Generate the guide in the PR's repo (so paths are relative to that repo's files).

## Principles

- **Verify before you write.** Invented files, wrong anchors, and un-checked line numbers silently pin notes to the wrong place. The reviewer can't tell they were misled.
- **Annotations add *why*, not *what*.** The line is already visible; pin context the line doesn't carry.
- **Prefer anchors over line numbers.** Anchors survive edits.
- **Use `>` (folded) for prose.** `|` renders hard-wrapped YAML lines as visible `<br>`s in the UI.
- **Scale the tour to the PR.** 20 lines of notes on a 5-line change feels like noise.
- **Trust `bunx @victorarias/jaunt validate`.** It catches the exact mistakes the app would silently misinterpret.
- **The guide is a local artifact.** Posting it to GitHub or to a shared location is out of scope — this skill is local-file only.
