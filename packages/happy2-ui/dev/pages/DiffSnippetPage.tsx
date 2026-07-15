import { DiffSnippet, type DiffLine } from "../../src/DiffSnippet";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

const reviewLines: DiffLine[] = [
    { kind: "meta", text: "@@ -41,7 +41,9 @@ export class TokenService {" },
    { kind: "context", number: 41, text: "async refresh(token: Token) {" },
    { kind: "del", number: 42, text: "  const lock = await mutex.tryLock()" },
    {
        kind: "add",
        number: 42,
        text: "  const lock = await mutex.lock({ timeout: 5_000, jitter: true })",
    },
    { kind: "add", number: 43, text: "  if (!lock) return queue.enqueue(token)" },
    { kind: "context", number: 44, text: "  try {" },
    { kind: "context", number: 45, text: "    const next = await provider.rotate(token)" },
    { kind: "del", number: 46, text: "    cache.set(token.id, next)" },
    {
        kind: "add",
        number: 47,
        text: "    await cache.replace(token.id, next, { ttl: next.expiresIn })",
    },
    { kind: "context", number: 48, text: "    return next" },
];

const inlineLines: DiffLine[] = [
    { kind: "meta", text: "src/auth/refresh.ts" },
    { kind: "del", text: "const lock = await mutex.tryLock()" },
    { kind: "add", text: "const lock = await mutex.lock({" },
    { kind: "add", text: "  timeout: 5_000, jitter: true" },
    { kind: "add", text: "})" },
];

const hunkLines: DiffLine[] = [
    { kind: "meta", text: "@@ -12,4 +12,4 @@ const defaults = {" },
    { kind: "context", number: 12, text: "  backoff: 'exponential'," },
    { kind: "del", number: 13, text: "  retries: 1," },
    { kind: "add", number: 13, text: "  retries: 3," },
    { kind: "context", number: 14, text: "  jitter: true," },
    { kind: "meta", text: "@@ -31,3 +31,3 @@ export function schedule() {" },
    { kind: "context", number: 31, text: "  const window = plan.next()" },
    { kind: "del", number: 32, text: "  return window.start" },
    { kind: "add", number: 32, text: "  return window.start.plus(jitterFor(window))" },
];

const overflowLines: DiffLine[] = [
    {
        kind: "context",
        number: 87,
        text: "const session = await client.sessions.create({ tenant, actor, scopes })",
    },
    {
        kind: "del",
        number: 88,
        text: "const refreshed = await client.tokens.refresh({ token, scopes, audience, tenant })",
    },
    {
        kind: "add",
        number: 88,
        text: "const refreshed = await client.tokens.refresh({ token, scopes, audience, tenant, jitter: true, timeout: 5_000 })",
    },
    { kind: "context", number: 89, text: "return refreshed" },
];

export function DiffSnippetPage() {
    return (
        <ComponentPage
            number="C-006"
            summary="Code-well diff block: mono header with +/− stats, 20px diff lines with sign gutter, optional line numbers, and inner horizontal scroll."
            title="DiffSnippet"
        >
            <Specimen
                detail="header 28px · file mono 11px · stats +N/−N · numbers 32px · gutter 24px · lines mono 12px/20px"
                label="Full review diff"
                number="01"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "8px",
                        width: "640px",
                    }}
                >
                    <DiffSnippet
                        file="src/auth/refresh.ts"
                        lines={reviewLines}
                        stats={{ added: 41, removed: 12 }}
                    />
                    <DimensionRule label="640px" />
                </div>
            </Specimen>

            <Specimen
                detail="no header, no numbers — the compact snippet embedded in an AgentRunCard"
                label="Inline snippet"
                number="02"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "8px",
                        width: "420px",
                    }}
                >
                    <DiffSnippet lines={inlineLines} />
                    <DimensionRule label="420px" />
                </div>
            </Specimen>

            <Specimen
                detail="meta rows render @@ hunk headers in faint text between numbered runs"
                label="Multiple hunks"
                number="03"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <DiffSnippet
                        file="src/retry/policy.ts"
                        lines={hunkLines}
                        stats={{ added: 2, removed: 2 }}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="long lines scroll horizontally inside the well — they never wrap"
                label="Horizontal overflow"
                number="04"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        "flex-direction": "column",
                        gap: "8px",
                        width: "360px",
                    }}
                >
                    <DiffSnippet
                        file="src/auth/client.ts"
                        lines={overflowLines}
                        stats={{ added: 1, removed: 1 }}
                    />
                    <DimensionRule label="360px" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
