/**
 * Client-side identity presets and validation for the required default-agent
 * creation step. The name is a product suggestion only: `Happy`/`happy` is the
 * proposed default, and the "feeling lucky" button draws from this list. The
 * durable identity is whatever the administrator submits, so nothing here is a
 * hard-coded server contract — the server validates independently.
 */
export interface DefaultAgentIdentity {
    readonly name: string;
    readonly username: string;
}

/** The proposed identity shown when the step first opens. */
export const DEFAULT_AGENT_PROPOSED: DefaultAgentIdentity = { name: "Happy", username: "happy" };

/**
 * Coherent name/username pairs for the "feeling lucky" preset. Each username
 * already satisfies {@link defaultAgentUsernameError}, so a lucky pick is always
 * submittable without further editing.
 */
export const DEFAULT_AGENT_PRESETS: readonly DefaultAgentIdentity[] = [
    { name: "Happy", username: "happy" },
    { name: "Mochi", username: "mochi" },
    { name: "Pixel", username: "pixel" },
    { name: "Sprout", username: "sprout" },
    { name: "Comet", username: "comet" },
    { name: "Nova", username: "nova" },
    { name: "Biscuit", username: "biscuit" },
    { name: "Juniper", username: "juniper" },
    { name: "Waffle", username: "waffle" },
    { name: "Marlow", username: "marlow" },
];

/** Matches the server's username contract: 3–32 lowercase letters/digits/_/-. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const MAX_NAME_LENGTH = 100;

/** Displayable error for the display-name field, or undefined when it is valid. */
export function defaultAgentNameError(name: string): string | undefined {
    const trimmed = name.trim();
    if (!trimmed) return "Enter a display name.";
    if (trimmed.length > MAX_NAME_LENGTH) return "Use 100 characters or fewer.";
    return undefined;
}

/** Displayable error for the username field, or undefined when it is valid. */
export function defaultAgentUsernameError(username: string): string | undefined {
    if (!username) return "Enter a username.";
    if (!USERNAME_PATTERN.test(username))
        return "Use 3–32 lowercase letters, digits, underscores, or hyphens.";
    return undefined;
}

/**
 * Picks a random preset identity, preferring one different from `current` so a
 * repeated "feeling lucky" press keeps changing the suggestion. `random` is
 * injectable so tests are deterministic.
 */
export function pickDefaultAgentIdentity(
    random: () => number = Math.random,
    current?: DefaultAgentIdentity,
): DefaultAgentIdentity {
    const candidates = current
        ? DEFAULT_AGENT_PRESETS.filter((preset) => preset.username !== current.username)
        : DEFAULT_AGENT_PRESETS;
    const pool = candidates.length > 0 ? candidates : DEFAULT_AGENT_PRESETS;
    const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
    return pool[index]!;
}
