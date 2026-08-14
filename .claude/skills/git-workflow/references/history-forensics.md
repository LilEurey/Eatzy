# History forensics

Reading history is how you understand code you didn't write and find bugs you can't reproduce by reading. Do this before changing unfamiliar code, not after breaking it.

## Why does this line exist?

```bash
git blame <file>                     # last commit to touch each line
git blame -L 40,60 <file>            # just lines 40–60
git blame -w -C <file>               # ignore whitespace, follow moved code
git show <sha>                       # the commit that line came from — read its message
```

`blame` gives you a SHA; the value is in `git show`ing it and reading *why*. A weird-looking guard clause is usually a bug fix, and deleting it reintroduces the bug.

`-w -C` matters on files that have been reformatted or moved — plain `blame` will otherwise attribute every line to whoever ran the formatter.

## When was this behavior introduced?

The pickaxe searches history for commits that changed the number of occurrences of a string:

```bash
git log -S "getUserToken" --oneline        # commits that added or removed it
git log -S "getUserToken" -p               # with the diffs
git log -G "regex.*pattern" --oneline      # regex on the diff content
```

This is how you find where a function was introduced, where a config value was last changed, or where a now-deleted call used to live.

## Following a file through renames

```bash
git log --follow -p -- <file>
```

Without `--follow`, history stops at the rename.

## Comparing states

```bash
git diff main...feature          # changes on feature since it diverged (what a PR shows)
git diff main..feature           # raw difference between the two tips
git diff HEAD~3 HEAD             # last three commits combined
git diff <sha1> <sha2> -- <file> # one file between two points
```

The three-dot form is what you almost always want when reviewing a branch — it excludes changes that landed on `main` in the meantime.

## Useful log views

```bash
git log --oneline --graph --decorate --all   # branch topology
git log --since="2 weeks ago" --oneline
git log --author="name" --oneline
git log --stat                               # files changed per commit
git log --oneline main..feature              # commits unique to feature
```

## git bisect — find the exact breaking commit

When something worked at some point and is broken now, bisect finds the culprit in log₂(n) steps. 1000 commits is 10 tests.

```bash
git bisect start
git bisect bad                # current commit is broken
git bisect good <sha>         # a commit known to work (e.g. a release tag)
# git checks out a midpoint — test it, then report:
git bisect good               # ...or: git bisect bad
# repeat until git names the first bad commit
git bisect reset              # return to where you started
```

Always finish with `git bisect reset`, otherwise the tree is left detached at a midpoint.

### Automated bisect

If the failure can be expressed as a command that exits non-zero, let git do all of it:

```bash
git bisect start HEAD <known-good-sha>
git bisect run npm test -- path/to/failing.test.js
```

Or with a script for anything more complex. The script must exit `0` for good, non-zero for bad, and `125` if the commit can't be tested (e.g. it doesn't build) so git skips it.

```bash
git bisect run ./check.sh
```

This turns "somewhere in the last 300 commits" into an exact SHA in a couple of minutes, unattended. It is the highest-leverage git command most people never use.

### Bisecting when commits are messy

Bisect assumes each commit is individually testable — which is exactly the payoff for atomic commits that pass their checks. If a midpoint commit is broken for unrelated reasons, `git bisect skip` moves past it.

## Recovering the reasoning behind a change

```bash
git log --merges --oneline           # merge commits often reference PR numbers
git show <merge-sha>                 # PR title and number
gh pr view <number>                  # the full discussion, if gh is available
```

The commit says what changed; the PR discussion usually says what else was considered and why it was rejected. When a change looks wrong, read the PR before "fixing" it.
