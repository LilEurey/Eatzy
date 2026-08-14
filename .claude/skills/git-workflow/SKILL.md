---
name: git-workflow
description: Senior-engineer git and GitHub practice for every coding project. Initialize a repo at the start of any new project, verify before committing, write atomic commits with clear messages, stay in sync with the remote, keep secrets and debris out of history, and run disciplined PR and review workflows. Use this skill whenever a new project or app is being started or scaffolded, whenever code or config has been written or modified, before any risky refactor, when debugging a regression or investigating why code looks the way it does, and whenever the user mentions git, GitHub, commits, branches, rebase, merge, .gitignore, pushing, PRs, CI, releases, or "save my work" — even if they never say the word "git". If files are being created or changed in a working directory, this skill applies.
---

# Git Workflow

The difference between junior and senior git use isn't knowing more commands. It's two habits:

**Treat history as a deliverable.** Commits are not save points for your own convenience — they are the primary debugging tool for whoever gets paged at 3am six months from now. That person will run `git bisect` and land on one of your commits. If it's a 900-line grab bag called "updates", you've cost them a day. If it's one coherent change with a message explaining why, you've saved them an hour. Every rule below follows from this.

**Never put the tree in a state you can't get back from.** Seniors aren't cautious because they're bad at git; they're cautious because they know exactly how `reset --hard` behaves. Commit before risk, verify before destroying, and prefer the recoverable option.

Two things happen automatically, without being asked:

1. **Every new project starts with `git init`** — before the second file is written, not at the end.
2. **Every meaningful chunk of work ends with a commit.**

## Starting a new project

When beginning a project, or when a working directory turns out not to be a repo, run setup before going further. Don't ask permission to initialize — just do it and mention it in one line afterward.

```bash
git rev-parse --git-dir 2>/dev/null   # already a repo? skip init
git init -b main
```

`-b` needs git 2.28+; on older versions use `git init` then `git branch -M main` after the first commit.

Before the first commit:

- **Write `.gitignore` first.** Not after — once `node_modules/` or a `.env` is committed, removing it becomes a history-rewrite problem instead of a one-line fix. See `references/gitignore-templates.md`.
- **Write a minimal `README.md`** — name, one-line purpose, how to run it. Three lines is enough.
- **Confirm commit identity**, since a wrong or missing one misattributes every commit and is tedious to fix later:

```bash
git config user.name && git config user.email
```

If unset, ask the user what to use rather than inventing a placeholder.

- **Initial commit**: `chore: initial commit`.

Don't create a remote or push during setup — that's the user's call (see "Remotes and GitHub").

## The commit loop

### 1. Verify before committing

Run the project's own checks before committing, not after. Committing code you haven't executed is how a broken commit ends up in the middle of history, which is exactly the commit `git bisect` will later stumble into and blame.

```bash
npm test && npm run lint     # or: pytest, cargo test, go test ./..., make check
```

If checks fail, fix them first. If they can't be fixed now and a checkpoint is still needed, commit to a feature branch and say plainly in the message that it's a WIP — never leave a knowingly-broken commit on a shared branch without flagging it.

### 2. Self-review the diff

Read every line that's about to be committed. This is a code review where you're the reviewer:

```bash
git status
git diff              # unstaged
git diff --staged     # staged
```

Scan specifically for:

- **Secrets** — keys, tokens, passwords, connection strings, private key blocks, `.env` files, cloud credentials. If one appears, unstage it, add it to `.gitignore`, and tell the user. A pushed secret is a compromised secret: it must be rotated, because deleting it in a later commit does not remove it from history.
- **Debris** — `console.log`, `print()`, `debugger`, commented-out blocks, stray `TODO`s, hardcoded test values, temporarily-disabled tests. This is the most common thing a real reviewer catches, and catching it yourself is free.
- **Unrelated edits** that wandered in and belong in a different commit.
- **Large or binary files** that shouldn't be tracked.

Never run `git add -A` on a tree you haven't read. Stage deliberately by path.

### 3. Make commits atomic

One commit, one logical change. When the working tree contains several unrelated changes, split them rather than dumping everything into one commit:

```bash
git add -p              # stage selected hunks interactively
git add -p <file>       # or hunk-by-hunk within one file
```

In `add -p`: `y` stage this hunk, `n` skip, `s` split into smaller hunks, `e` edit manually, `q` quit. Commit, then repeat for the next logical change.

The test for atomicity: **could this commit be reverted on its own without breaking anything?** If reverting it would also undo an unrelated fix, it's two commits.

Keep refactors and behavior changes in separate commits. A diff that both moves 300 lines and changes logic is unreviewable — nobody can tell which of those 300 lines actually changed.

### 4. Write the message

Conventional Commits: `type(scope): summary`, imperative mood, under ~72 chars, no trailing period.

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style`, `build`, `ci`.

Write the message from the diff, not from what you intended to do.

**Example 1**
Changes: login route, JWT signing, token middleware
`feat(auth): add JWT login and token middleware`

**Example 2**
Changes: off-by-one in pagination offset
`fix(api): correct off-by-one in pagination offset`

**Example 3**
Changes: dependency bump, no behavior change
`chore(deps): upgrade express to 5.1.0`

For anything non-obvious, add a body after a blank line explaining **why**. The diff already shows what changed; it can never show what you were thinking or what you ruled out. This is the highest-value thing in the whole history.

```
fix(cache): invalidate on write instead of TTL

TTL expiry let stale prices serve for up to 60s after an update,
which surfaced as the pricing mismatch in #412. Write-through
invalidation costs one extra redis call per write — acceptable
given writes are ~2% of traffic.
```

Reference issues (`#412`, `Fixes #88`) so the history links back to the discussion.

Match the repo's existing conventions when they differ — run `git log --oneline -20` before assuming a format. Don't add AI attribution, `Co-authored-by`, or emoji unless the repo already uses them or the user asks.

### When to commit

- A feature or subtask works and its checks pass
- A bug is fixed
- **Before** a risky refactor, dependency upgrade, or large delete — this is the highest-value commit you'll make, because it's the rollback point
- Before the session ends
- Any time the tree exceeds one reviewable unit

Announce it in one line — "Committed as `feat(auth): add JWT login`" — not a narration of the whole workflow.

## Branching and staying in sync

For anything beyond a small fix in an existing repo, branch:

```bash
git checkout -b feat/short-description
```

Prefixes: `feat/`, `fix/`, `chore/`, `refactor/`. On a brand-new solo project, committing to `main` is fine; introduce branches once there's a remote, collaborators, or a deploy.

**Fetch before you act.** `git fetch` is always safe — it updates your view of the remote without touching your working tree. Inspect, then decide:

```bash
git fetch origin
git log --oneline HEAD..origin/main   # what's landed that I don't have
git log --oneline origin/main..HEAD   # what I have that isn't pushed
```

**Rebase your feature branch onto main rather than merging main into it.** A feature branch with six "Merge branch 'main' into feat/x" commits is unreadable, and the eventual PR diff becomes impossible to follow.

```bash
git pull --rebase origin main    # or: git rebase origin/main after fetching
```

Set it as the default so it isn't something to remember:

```bash
git config --global pull.rebase true
```

Rebase in small, frequent steps. A branch rebased daily has trivial conflicts; a branch rebased after three weeks has a nightmare.

**The golden rule of rebasing: rebase your own unpushed work freely, never rebase shared history.** Rewriting commits others have pulled breaks their clones and forces them into painful recovery. If a branch is yours alone and pushed only for backup, rebasing and force-pushing with `--force-with-lease` is fine.

**Never rebase or pull with a dirty tree.** Commit or stash first — otherwise a conflict leaves uncommitted work tangled up in a half-finished operation.

Resolve conflicts by reading both sides. Never take one side wholesale to make the conflict go away; that silently deletes someone's work. If the correct resolution isn't obvious, show the user both versions and ask. After resolving, re-run the tests — a conflict resolved to compile is not a conflict resolved correctly.

## Read history before changing code

Before modifying unfamiliar code, find out why it looks the way it does. That strange-looking condition is usually a bug fix, and deleting it reintroduces the bug. This is what a senior does that a junior skips.

```bash
git log --oneline -20 -- <file>   # this file's history
git log -p -- <file>              # with diffs
git blame <file>                  # who last touched each line, and in which commit
git show <sha>                    # the full commit and its message
git log -S "functionName"         # commits that added or removed that string
```

When hunting a regression, `git bisect` finds the exact breaking commit in log₂(n) steps instead of by guesswork. Full workflow, including `bisect run` for automated bisection, is in `references/history-forensics.md`.

## Remotes and GitHub

Local git is automatic. **Anything that touches a remote asks first** — pushing, creating a repository, opening a PR, and merging all publish the user's work, may consume a private repo slot, and can trigger CI or a deploy. Once the user agrees in a session, subsequent pushes to that branch don't need re-asking.

```bash
gh auth status
gh repo create <name> --private --source=. --push
git push -u origin <branch>
```

Default to `--private`. A repo can be opened up later; code that was briefly public should be treated as public forever.

Before requesting review, review your own PR — `gh pr diff` shows exactly what the reviewer will see, and it's remarkable what's obvious there that wasn't obvious in the editor. Then check CI rather than assuming green:

```bash
gh pr diff
gh pr checks
```

Keep PRs small; a 200-line PR gets real review, a 2000-line PR gets "LGTM". Address review feedback with `git commit --fixup <sha>` and autosquash so history stays clean. PR templates, review etiquette, stacked PRs, merge strategies, and tagging releases are in `references/pull-requests.md`.

## Safety rules

These operations lose work. Confirm with the user every time, explaining in plain language what will be lost:

- `git push --force` — use `--force-with-lease` (it refuses if someone else pushed meanwhile), and never on `main`
- `git reset --hard`, `git checkout -- .`, `git restore` over uncommitted changes
- `git clean -fd` — deletes untracked files permanently; they were never in git, so there is no recovery
- `git rebase`, `git commit --amend`, or `git push --force` on already-pushed shared history
- Deleting branches with unmerged commits

Never use `--no-verify` to bypass a failing hook. The hook exists because someone wanted that check; fix the cause or explain to the user why it's failing.

Never commit dependency directories, build output, or large binaries. If they're already tracked, say so and offer to untrack them.

## When something goes wrong

Almost nothing committed to git is ever truly lost — the reflog keeps unreachable commits for ~90 days. Before telling a user their work is gone, check `references/recovery.md`: reflog rescue, undoing commits, unstaging, restoring files, escaping a broken rebase or merge, and handling a committed secret.

## Picking up an existing repository

Orient before touching anything:

```bash
git status                    # uncommitted work already here?
git log --oneline -20         # what conventions does this repo use?
git branch --show-current
git remote -v
```

If there are uncommitted changes that aren't yours, don't sweep them into your commit and don't discard them — point them out and ask.
