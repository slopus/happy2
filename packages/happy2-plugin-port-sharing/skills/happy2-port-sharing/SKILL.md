---
name: happy2-port-sharing
description: Run, expose, authenticate, verify, and stop web previews from the current Happy chat agent container. Use when a user asks to share a local development server, publish a container port, open a preview URL, test an exposed endpoint, obtain a scoped access token, or stop port sharing.
---

# Happy2 port sharing

Expose only a server in the current chat container. Happy derives the chat,
agent container, and triggering user from signed tool metadata; never attempt to
select them manually.

## Share and verify a preview

1. Start or confirm the application server. Bind it to `0.0.0.0` on one fixed
   port from `3000` through `3010`; a loopback-only listener cannot be reached
   through the container port mapping.
2. Call `happy2_port_shares_list`. Only one share may be active in a chat. Reuse
   a matching share; ask before disabling an unrelated active share unless the
   user explicitly requested replacement.
3. Call `happy2_port_share_expose` with the listening port, a short friendly
   name, and the narrowest audience that satisfies the request:
    - `internet`: anyone with the link. This is the only audience the model can
      access directly without a Happy user credential.
    - `server`: any authenticated, active user on this Happy server.
    - `chat`: only authenticated current members of this chat.
      Ask the user before choosing `internet` unless they explicitly requested a
      public or internet-wide link. Do not claim success until the tool returns the
      public URL.
4. Call `happy2_port_share_probe` against `/` or the application's health path.
   This tool supplies the triggering user's authentication for `server` and
   `chat` shares; ordinary model HTTP clients cannot authenticate to those
   audiences. If it fails, first test the same path locally inside the
   container, then fix the listener, route, or application error and probe
   again.
5. Report the returned public URL. Opening it starts the browser authorization
   bounce when the preview cookie is absent or expired.

## Direct authenticated requests

Prefer `happy2_port_share_probe` for routine verification because it consumes a
fresh token without returning it. Use
`happy2_port_share_create_access_token` only when a custom client genuinely
needs the bearer token. Treat the returned token as a secret: consume it only
in an `X-Happy2-Port-Share-Authorization: Bearer <token>` header, never in the
application `Authorization` header, and never paste it into chat, source files,
logs, URLs, or command history. Tokens last one hour; request a fresh one after
the returned `refreshAfter` time rather than persisting it.

Happy rechecks the token's user and the share's current audience in SQLite on
every request. Removing a user from a chat immediately revokes their access to a
`chat` share even if their token or browser cookie has not expired.

## Stop sharing

Call `happy2_port_share_disable` only for the exact share the user asked to
stop, or when cleanup was explicitly part of the task. Disabling immediately
invalidates the hostname and every token issued for it. Stopping the local
server alone does not disable the public share record.
