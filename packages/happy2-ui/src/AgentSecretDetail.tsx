import { For, Show, splitProps, type JSX } from "solid-js";
import { Badge } from "./Badge";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Select, type SelectOption } from "./Select";

/** An agent or channel a secret is attached to. */
export type AgentSecretBinding = {
    id: string;
    name: string;
    /** Secondary line: a username, slug, or kind, shown muted under the name. */
    secondary?: string;
};

export type AgentSecretDetailProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    /** The secret's environment-variable names. Values never reach the client. */
    environmentVariables: readonly string[];
    agents: readonly AgentSecretBinding[];
    channels: readonly AgentSecretBinding[];
    /** Agents not yet attached, offered by the attach picker. */
    availableAgents?: readonly SelectOption[];
    /** Channels not yet attached, offered by the attach picker. */
    availableChannels?: readonly SelectOption[];
    /** Ids with an in-flight detach; their remove button disables. */
    busyAgentIds?: readonly string[];
    busyChannelIds?: readonly string[];
    /** An attach request is in flight; the matching picker disables. */
    attachingAgent?: boolean;
    attachingChannel?: boolean;
    /** A mutation error, shown as a banner above the sections. */
    error?: string;
    onDismissError?: () => void;
    onAttachAgent?: (agentUserId: string) => void;
    onDetachAgent?: (agentUserId: string) => void;
    onAttachChannel?: (channelId: string) => void;
    onDetachChannel?: (channelId: string) => void;
};

/**
 * C-056 AgentSecretDetail — the body of an agent secret's detail: the secret's
 * environment-variable names (values are held only in the Rig and never shown),
 * and the agents and channels the secret is attached to. Each attachment can be
 * removed, and an available agent or channel can be attached from a picker.
 * Presentational and fully controlled; a consuming app supplies the current
 * bindings and the pickable candidates. Designed to sit inside a Modal (which
 * carries the secret's description as its title).
 */
export function AgentSecretDetail(props: AgentSecretDetailProps) {
    const [local, rest] = splitProps(props, [
        "class",
        "style",
        "environmentVariables",
        "agents",
        "channels",
        "availableAgents",
        "availableChannels",
        "busyAgentIds",
        "busyChannelIds",
        "attachingAgent",
        "attachingChannel",
        "error",
        "onDismissError",
        "onAttachAgent",
        "onDetachAgent",
        "onAttachChannel",
        "onDetachChannel",
    ]);

    return (
        <Box
            {...rest}
            class={["happy2-agent-secret-detail", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="agent-secret-detail"
            style={local.style}
        >
            <Show when={local.error}>
                {(reason) => (
                    <Banner onDismiss={local.onDismissError} tone="danger" title="Action failed">
                        {reason()}
                    </Banner>
                )}
            </Show>

            <Section label="Environment variables">
                <Show
                    when={local.environmentVariables.length > 0}
                    fallback={<p class="happy2-agent-secret-detail__empty">No variables.</p>}
                >
                    <Box class="happy2-agent-secret-detail__variables">
                        <For each={local.environmentVariables}>
                            {(name) => <Badge label={name} variant="outline" />}
                        </For>
                    </Box>
                </Show>
                <p class="happy2-agent-secret-detail__note">
                    <Icon name="shield" size={14} />
                    Values are stored in the Rig and never leave it.
                </p>
            </Section>

            <BindingSection
                attaching={local.attachingAgent}
                available={local.availableAgents}
                bindings={local.agents}
                busyIds={local.busyAgentIds}
                emptyLabel="No agents attached yet."
                icon="agents"
                label="Agents"
                onAttach={local.onAttachAgent}
                onDetach={local.onDetachAgent}
                part="agents"
                pickerPlaceholder="Attach an agent…"
            />

            <BindingSection
                attaching={local.attachingChannel}
                available={local.availableChannels}
                bindings={local.channels}
                busyIds={local.busyChannelIds}
                emptyLabel="No channels attached yet."
                icon="hash"
                label="Channels"
                onAttach={local.onAttachChannel}
                onDetach={local.onDetachChannel}
                part="channels"
                pickerPlaceholder="Attach a channel…"
            />
        </Box>
    );
}

function Section(props: { label: string; children: JSX.Element }) {
    return (
        <section class="happy2-agent-secret-detail__section">
            <header class="happy2-agent-secret-detail__section-head">
                <span class="happy2-agent-secret-detail__section-label">{props.label}</span>
            </header>
            {props.children}
        </section>
    );
}

function BindingSection(props: {
    label: string;
    part: string;
    icon: IconName;
    emptyLabel: string;
    pickerPlaceholder: string;
    bindings: readonly AgentSecretBinding[];
    available?: readonly SelectOption[];
    busyIds?: readonly string[];
    attaching?: boolean;
    onAttach?: (id: string) => void;
    onDetach?: (id: string) => void;
}) {
    const options = () => props.available ?? [];
    const canAttach = () => Boolean(props.onAttach) && options().length > 0 && !props.attaching;
    const busy = (id: string) => props.busyIds?.includes(id) ?? false;

    return (
        <section
            class="happy2-agent-secret-detail__section"
            data-happy2-ui={`agent-secret-detail-${props.part}`}
        >
            <header class="happy2-agent-secret-detail__section-head">
                <span class="happy2-agent-secret-detail__section-label">{props.label}</span>
                <span class="happy2-agent-secret-detail__section-count">
                    {props.bindings.length}
                </span>
            </header>

            <Show
                when={props.bindings.length > 0}
                fallback={<p class="happy2-agent-secret-detail__empty">{props.emptyLabel}</p>}
            >
                <Box class="happy2-agent-secret-detail__bindings">
                    <For each={props.bindings}>
                        {(binding) => (
                            <Box
                                class="happy2-agent-secret-detail__binding"
                                data-binding-id={binding.id}
                            >
                                <span class="happy2-agent-secret-detail__binding-icon">
                                    <Icon name={props.icon} size={16} />
                                </span>
                                <Box class="happy2-agent-secret-detail__binding-text">
                                    <span class="happy2-agent-secret-detail__binding-name">
                                        {binding.name}
                                    </span>
                                    <Show when={binding.secondary}>
                                        <span class="happy2-agent-secret-detail__binding-secondary">
                                            {binding.secondary}
                                        </span>
                                    </Show>
                                </Box>
                                <Show when={props.onDetach}>
                                    <Button
                                        aria-label={`Detach ${binding.name}`}
                                        disabled={busy(binding.id)}
                                        icon="close"
                                        iconOnly
                                        onClick={() => props.onDetach?.(binding.id)}
                                        size="small"
                                        variant="ghost"
                                    />
                                </Show>
                            </Box>
                        )}
                    </For>
                </Box>
            </Show>

            <Show when={props.onAttach}>
                <Select
                    class="happy2-agent-secret-detail__picker"
                    disabled={!canAttach()}
                    fullWidth
                    onValueChange={(value) => {
                        if (value) props.onAttach?.(value);
                    }}
                    options={[...options()]}
                    placeholder={
                        options().length > 0
                            ? props.pickerPlaceholder
                            : `Every ${props.part.slice(0, -1)} is attached`
                    }
                    size="small"
                    value=""
                />
            </Show>
        </section>
    );
}
