# Agent Instructions

## Project

Rigged is a universal work and coding app that evolves by adopting itself.

## Sync to main

When asked to “sync to main,” commit the current work, fetch and rebase it onto
the latest `origin/main`, then push the resulting `HEAD` to `main` with a normal
non-force push. If `main` advances or the push is rejected, fetch, rebase again,
and retry until the push succeeds. Never force-push `main`.
