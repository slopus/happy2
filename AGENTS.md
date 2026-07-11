# Agent Instructions

## Project

Rigged is a desktop work and coding app that evolves by adopting itself. It is
desktop-only: do not assume mobile use, add mobile-specific behavior, or adapt
layouts for mobile viewports.

## Sync to main

When asked to “sync to main,” commit the current work, fetch and rebase it onto
the latest `origin/main`, then push the resulting `HEAD` to `main` with a normal
non-force push. If `main` advances or the push is rejected, fetch, rebase again,
and retry until the push succeeds. Never force-push `main`.
