# jaunt

Review a GitHub PR in a curated order, with an agent walking you through it.

You ask your coding agent for a tour of a PR. The agent reads the diff, writes a little reading guide, and opens a local web app with the files laid out the way the author would have walked you through them — plan doc first, then the aggregate, then the service, and so on. Every important line has a note pinned to it. You read, you reply, you submit. The agent reads your feedback, fixes what you flagged, and hands the tour back for another round. Repeat until you're happy.

It's a quiet tool. No accounts, no inbox, no notifications. The files live locally.

## Install

```bash
bunx @victorarias/jaunt install-skill
```

That's it. `bunx` fetches the latest `@victorarias/jaunt`, `install-skill` drops the `/jaunt` skill into `~/.claude/skills/jaunt/` so Claude Code picks it up on the next session. Requires [Bun](https://bun.sh/) and the [GitHub CLI](https://cli.github.com/) (authenticated via `gh auth login`).

If you want `jaunt` as a standing global command instead of invoking via `bunx` every time:

```bash
bun add -g @victorarias/jaunt
```

Either way, the command on your PATH is just `jaunt`.

## Use it

Open your editor in a repo where a PR is waiting. Ask your agent:

> "Can you give me a tour of PR #349?"

The agent will:

1. Read the PR — diff, body, linked plan docs.
2. Write a `.jaunt-guide.yml` in the repo's root: a reading order with per-file notes and line-pinned annotations.
3. Launch the web app and hand you the URL.

You review in the browser. Reply inline to the agent's pinned notes, add your own per-file comments, mark files as reviewed as you go. Keyboard-driven: `j`/`k` move between files, `n`/`p` step through annotations inside the current file, `s` opens the submit dialog.

When you've got something for the agent, hit **Submit**. The default sends your notes back to the agent and **leaves the server up** — so you can keep reading, keep adding comments, and submit again as often as you want. Each submit appends a new section to the feedback file.

When you're actually done, tick **End review after this submit** in the submit dialog. That's the signal that hands control back to the agent: the server exits, the agent reads every round of feedback you sent, addresses the points, commits the changes, and re-launches the tour on the same URL. Refresh the tab — a fresh draft, updated code, and you go again.

You can also submit to GitHub directly as a review comment, if you'd rather post publicly than iterate with the agent.

## The guide file

`.jaunt-guide.yml` is the shape the agent writes. If you ever want to hand-write one (or eyeball what the agent made), it looks like this:

```yaml
version: 1

summary: >
  Two-to-four lines telling the reader the reading strategy —
  the "why" of this PR and where to start.

files:
  - path: docs/plans/2026-04-18-foo.md
    view: content                       # default is "diff"; use "content" for docs
    note: >
      Start here. DT-* are the decision tables, INV-* the invariants.
      The service implements these literally.
    annotations:
      - anchor: "## Decision table 2"   # pin a note to the first line containing this
        note: The pair rules. If it's not in this table, the service rejects it.

  - path: server/internal/foo/service.go
    note: The aggregate. Start with the enums — the rest just switches on them.
    annotations:
      - anchor: "func (s *Service) Resolve"
        thread:
          - First-writer-wins lives here (INV-5). The CAS enforces it.
          - >
            Went back and forth on retry-on-conflict — dropped it, breaks
            idempotency when the caller's a webhook.

skip:
  - server/internal/platform/postgres/sqlcgen/queries.sql.go
```

- `files` appear in order, numbered, with notes above the code.
- `view: content` renders the full post-PR file instead of a diff — right for design docs where the diff is all-add.
- Annotations take one of `anchor:` (substring match, recommended), `line: N`, or `start: N, end: M`. Prefer anchors — they survive edits.
- `skip` files render dimmed at the bottom; good for generated code.

Validate the guide any time with:

```bash
jaunt validate
```

## Commands

```bash
jaunt <pr-ref>                  # launch the app (auto-opens browser)
jaunt <pr-ref> --host           # bind to all interfaces (remote dev / codespaces)
jaunt <pr-ref> --port 5174      # bind a specific port
jaunt <pr-ref> --no-guide       # ignore any local guide, show files alphabetically
jaunt <pr-ref> --guide <path>   # use an explicit guide file

jaunt validate [path]           # check schema + paths + anchors against the PR
jaunt validate --offline        # schema-only, no gh calls
jaunt install-skill [--force]   # install the /jaunt Claude skill
```

PR refs accept any of `349`, `owner/repo#349`, `owner/repo/349`, or the full `https://github.com/.../pull/349` URL. A bare number resolves against the current repo via `gh`.

## Develop from source

```bash
git clone https://github.com/victorarias/jaunt.git
cd jaunt
bun install
bun run link                    # symlinks `jaunt` → ./src/cli.ts
bun test                        # run the test suite
bun run typecheck
```

The linked binary runs straight from the repo; `git pull` picks up updates with no rebuild.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
