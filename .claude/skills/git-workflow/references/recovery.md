# Git recovery

Anything that was ever committed can almost always be recovered, because git keeps unreachable commits for ~90 days. The main exception is untracked files deleted by `git clean` — those were never in git and are gone.

Before running any recovery command that changes the working tree, check `git status` and stash or commit anything uncommitted. Recovery that destroys the thing you were trying to recover is a bad outcome.

## The reflog is the safety net

`git reflog` records every position `HEAD` has been at — including commits orphaned by a reset, rebase, or branch delete.

```bash
git reflog                    # find the SHA of the state you want back
git reset --hard <sha>        # return to it (discards current uncommitted work)
git checkout -b rescue <sha>  # safer: inspect it on a new branch first
```

## Undo the last commit

```bash
git reset --soft HEAD~1   # undo commit, keep changes staged  ← usually what's wanted
git reset HEAD~1          # undo commit, keep changes unstaged
git reset --hard HEAD~1   # undo commit AND discard the changes (destructive)
```

If the commit was already pushed, don't reset — revert instead, which adds a new commit undoing the old one and leaves history intact:

```bash
git revert <sha>
```

## Fix the last commit message

```bash
git commit --amend -m "correct message"
```

Only if it hasn't been pushed. Amending a pushed commit rewrites published history.

## Unstage without losing changes

```bash
git restore --staged <file>   # modern
git reset HEAD <file>         # older git
```

## Restore a deleted or modified file

```bash
git restore <file>                  # discard uncommitted changes to it
git restore --source=HEAD~3 <file>  # get the version from 3 commits ago
git checkout <sha> -- <file>        # get it from a specific commit
```

## Recover a deleted branch

```bash
git reflog | grep <branch-name>
git checkout -b <branch-name> <sha>
```

## Find a commit whose branch is gone

```bash
git fsck --lost-found            # lists dangling commits
git show <sha>                   # inspect one
git checkout -b rescue <sha>
```

## Escape a broken rebase or merge

```bash
git rebase --abort
git merge --abort
```

Both return to the state before the operation started. If the rebase is partly done and aborting isn't possible, `git reflog` still has the pre-rebase SHA.

## Resolve merge conflicts

```bash
git status                     # lists conflicted files
# edit each file, remove <<<<<<< ======= >>>>>>> markers
git add <resolved-files>
git rebase --continue          # or: git commit, for a merge
```

Never resolve a conflict by picking one side wholesale without reading both — that silently deletes someone's work. If the correct resolution isn't obvious, show the user both sides and ask.

## Stash

```bash
git stash push -m "wip: description"
git stash list
git stash pop           # apply most recent and remove from stash
git stash apply stash@{2}
```

Stashes are also recoverable after a `stash drop` via `git fsck --unreachable | grep commit`, but this is fiddly — prefer a WIP commit on a branch over a stash for anything valuable.

## Accidentally committed a large file

```bash
git rm --cached <big-file>
echo "<big-file>" >> .gitignore
git commit -m "chore: untrack large file"
```

This stops tracking it going forward. It stays in history and the repo stays large; fully removing it requires `git filter-repo`, which rewrites every subsequent commit and invalidates all clones. Only do that with the user's explicit go-ahead.

## Committed a secret

1. Rotate the credential immediately — assume it is compromised, especially if pushed.
2. Remove it from the working tree and add the path to `.gitignore`.
3. Only then discuss history rewriting, and be clear it breaks every existing clone.

Order matters: rotation is the fix, history rewriting is cleanup.
