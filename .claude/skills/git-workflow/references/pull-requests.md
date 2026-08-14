# Pull requests, review, and releases

Every command here touches a remote. Confirm with the user before pushing, opening, merging, or releasing.

## Before opening

Rebase onto the latest `main` so the PR contains only your changes and CI tests what will actually be merged:

```bash
git fetch origin
git rebase origin/main
npm test    # or the project's checks — re-run after rebasing, not before
git push -u origin <branch>
```

## Sizing

Keep PRs under roughly 400 lines of real change. This isn't aesthetics: review quality falls off a cliff past that point, and a 2000-line PR reliably gets "LGTM" instead of review. If a change is genuinely large, split it into a sequence of PRs — refactor first, then behavior — so each one is reviewable on its own.

For work that must ship together, stack it: branch B off branch A, open B against A rather than `main`, and merge in order. Each PR stays small and each diff shows only its own change.

## Opening

```bash
gh pr create --title "feat(auth): add JWT login" --body "..."
gh pr create --fill        # uses commit messages — fine for a single-commit PR
gh pr create --draft       # work in progress, or you want early CI feedback
```

A useful description covers:

```markdown
## What
One or two sentences on what changed.

## Why
The problem this solves. Link the issue: Fixes #412

## How to test
Concrete steps, or the command to run.

## Notes
Trade-offs, follow-up work, anything you want the reviewer to look at hardest.
```

Reviewers read the description first. "Why" is the part they can't reconstruct from the diff, and it's the part most people leave out.

## Review your own PR first

```bash
gh pr diff
gh pr checks           # don't assume green
gh pr view --web
```

Reading the diff in the PR view — not the editor — catches a surprising amount: leftover debug lines, a file you didn't mean to touch, a rename that dragged in unrelated changes. Fix those before a human spends time on them.

If CI is red, fix it before requesting review. Asking someone to review a failing PR wastes their time twice.

## Responding to review feedback

Don't pile on `fix review comments` commits. Use fixup commits, which attach to the commit they correct and collapse into it on rebase:

```bash
git commit --fixup <sha-of-commit-being-fixed>
git rebase -i --autosquash origin/main
git push --force-with-lease
```

Enable autosquash by default:

```bash
git config --global rebase.autosquash true
```

Always `--force-with-lease` rather than `--force`: it refuses the push if someone else pushed to the branch in the meantime, instead of silently destroying their commits.

Reply to every review comment, even just to confirm it's addressed — silence reads as disagreement. If you disagree, say why in the thread rather than quietly ignoring it.

## Reviewing someone else's PR

```bash
gh pr checkout <number>    # run it locally rather than reviewing by eye
gh pr diff <number>
gh pr review --approve
gh pr review --request-changes --body "..."
```

Distinguish blocking issues from preferences. Prefix non-blocking comments with `nit:` so the author knows what actually has to change. Ask questions rather than issuing instructions when you might be missing context — "what happens if this is null?" surfaces bugs and stays collaborative.

## Merging

```bash
gh pr merge --squash    # one commit on main — best for messy WIP history
gh pr merge --rebase    # preserves individual commits, linear history
gh pr merge --merge     # merge commit, preserves branch topology
```

Follow the repo's existing convention — check whether `main`'s history is linear (`git log --graph --oneline -20`) before picking. Squash is the common default because it makes each `main` commit revertible as a unit; rebase suits a series of well-crafted atomic commits that are individually valuable.

Delete the branch after merging (`--delete-branch`). Stale branches accumulate fast.

## Tags and releases

Annotated tags (`-a`) store a tagger, date, and message; lightweight tags don't. Use annotated for anything you release.

```bash
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
git tag -l                    # list
git describe --tags           # human-readable position relative to last tag
```

Semver: `MAJOR.MINOR.PATCH` — breaking change, backward-compatible feature, backward-compatible fix.

```bash
gh release create v1.2.0 --generate-notes
```

`--generate-notes` builds the changelog from merged PR titles since the last tag — a concrete payoff for having written decent PR titles.

Tag the commit that was actually tested and shipped. Tagging `main` at a point that never went through CI defeats the purpose of tagging.

## Hotfixes

```bash
git checkout -b fix/critical-thing origin/main
# fix, test, commit
gh pr create --title "fix: ..." --label urgent
```

Branch a hotfix from `main` (or the release tag it's fixing), never from an in-progress feature branch — otherwise the fix drags unfinished work into production with it.
