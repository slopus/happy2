export function isUniqueConstraint(error: unknown, seen = new Set<unknown>()): boolean {
    if (!error || typeof error !== "object" || seen.has(error)) return false;
    seen.add(error);
    const candidate = error as {
        cause?: unknown;
        code?: unknown;
        message?: unknown;
    };
    return (
        String(candidate.code ?? "").includes("CONSTRAINT") ||
        String(candidate.message ?? "").includes("UNIQUE constraint") ||
        isUniqueConstraint(candidate.cause, seen)
    );
}
