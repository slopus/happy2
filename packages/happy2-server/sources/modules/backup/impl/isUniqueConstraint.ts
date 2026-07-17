export function isUniqueConstraint(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; current && depth < 5; depth += 1) {
        const value = current as {
            code?: unknown;
            message?: unknown;
            cause?: unknown;
        };
        const details = `${String(value.code ?? "")} ${String(value.message ?? "")}`.toLowerCase();
        if (details.includes("unique") || details.includes("constraint")) return true;
        current = value.cause;
    }
    return false;
}
