<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Repository Agent Instructions

These instructions apply to all future Git, worktree, and Codespaces operations in this repository.

## Git Worktree Safety Rules

Application files are replaceable. Git metadata is infrastructure.

Treat `.git` as protected infrastructure at all times.

In Git worktrees, `.git` may be a pointer file rather than a directory. Deleting or overwriting it can break the worktree.

Therefore, never run broad destructive commands inside a repository or Git worktree such as:

```bash
rm -rf ./*
rm -rf ./.??*
rm -rf .*
rm -rf .git
find . -delete
```

Do not run equivalent wildcard deletion commands that could affect hidden files or Git metadata.

Never delete, overwrite, reconstruct, or manually edit:

- `.git`
- `.git/worktrees/`
- Git worktree pointer files
- Git index metadata

unless the user explicitly authorizes a specific Git repair operation.

When replacing application source inside a Git worktree:

1. Extract incoming files into a temporary directory outside the worktree.
2. Inspect the extracted structure.
3. Copy into the worktree using a safe command such as `rsync`.
4. Explicitly exclude `.git`.
5. Verify Git integrity immediately afterward.

Preferred pattern:

```bash
rsync -a --delete \
	--exclude='.git' \
	<source-directory>/ \
	<git-worktree>/
```

Before any destructive filesystem operation:

- Confirm `pwd`.
- Confirm `git rev-parse --show-toplevel`.
- Confirm `git branch --show-current`.
- Identify exactly what will be deleted.
- Prefer targeted deletion over wildcard deletion.

After any operation that replaces or removes repository files, verify:

```bash
git rev-parse --is-inside-work-tree
git status
git branch --show-current
git worktree list
```

If an operation could damage Git metadata, stop and ask before executing it.
