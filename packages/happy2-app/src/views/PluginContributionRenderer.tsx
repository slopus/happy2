import type { ReactNode } from "react";
import type {
    PluginActionState,
    PluginContributionActionValue,
    PluginContributionSummary,
    PluginMenuState,
} from "happy2-state";
import {
    PluginAssetGlyph,
    PluginContributionMenuButton,
    PluginContributionSection,
    PluginContributionControl,
    type ButtonVariant,
} from "happy2-ui";
import type { PluginAssetMasks } from "../pluginAssets";
import {
    pluginActionStateKey,
    pluginActionUiState,
    pluginMenuStateKey,
    pluginMenuUiState,
} from "../pluginContributions";

/**
 * The transient-state slice plus intent methods a contribution surface exposes.
 * Both the global navigation store and a chat-scoped contributions store satisfy
 * it, so one renderer serves every placement.
 */
export interface ContributionSurface {
    readonly actionStates: ReadonlyMap<string, PluginActionState>;
    readonly menuStates: ReadonlyMap<string, PluginMenuState>;
    pluginContributionInvoke(input: {
        contributionId: string;
        actionId: string;
        value?: PluginContributionActionValue;
        messageId?: string;
    }): void;
    pluginContributionMenuResolve(contributionId: string, messageId?: string): void;
}

function assetGlyphFactory(
    masks: PluginAssetMasks,
    installationId: string,
    size: number,
): (assetId: string) => ReactNode {
    // Not a component: a data callback that resolves one asset id to a glyph node.
    return function assetGlyph(assetId: string): ReactNode {
        return <PluginAssetGlyph maskUrl={masks.maskUrl(installationId, assetId)} size={size} />;
    };
}

/**
 * Renders one profile/settings-placement contribution inline as a native section
 * or single control. Never renders plugin HTML/CSS.
 */
export function PluginInlineContribution(props: {
    contribution: PluginContributionSummary;
    surface: ContributionSurface;
    masks: PluginAssetMasks;
}): ReactNode {
    const { contribution, surface, masks } = props;
    const spec = contribution.spec;
    const invoke = (actionId: string, value?: PluginContributionActionValue) =>
        surface.pluginContributionInvoke({ contributionId: contribution.id, actionId, value });
    const actionStateFor = (actionId: string) =>
        pluginActionUiState(
            surface.actionStates.get(pluginActionStateKey(contribution.id, actionId)),
        );
    const glyph = assetGlyphFactory(masks, contribution.installationId, 16);
    if (spec.kind === "section")
        return (
            <PluginContributionSection
                actionStateFor={actionStateFor}
                assetGlyph={glyph}
                controls={spec.controls}
                data-testid={`plugin-contribution-${contribution.id}`}
                description={contribution.description}
                onInvoke={invoke}
                title={contribution.title}
            />
        );
    if (spec.kind === "button")
        return (
            <PluginContributionControl
                actionState={actionStateFor(spec.id)}
                assetGlyph={glyph}
                control={spec}
                data-testid={`plugin-contribution-${contribution.id}`}
                onInvoke={invoke}
            />
        );
    // Static/async menus are menu-placement contributions; render their trigger.
    return <PluginMenuContribution contribution={contribution} masks={masks} surface={surface} />;
}

/**
 * Renders one menu-placement contribution (sidebar/chat/composer/message) as a
 * native trigger: a `button` invokes directly; a `staticMenu` opens a bounded
 * list; an `asyncMenu` resolves on open. `messageId` scopes a message-menu
 * invocation to its message.
 */
export function PluginMenuContribution(props: {
    contribution: PluginContributionSummary;
    surface: ContributionSurface;
    masks: PluginAssetMasks;
    messageId?: string;
    iconOnly?: boolean;
    variant?: ButtonVariant;
    size?: "small" | "medium";
}): ReactNode {
    const { contribution, surface, masks, messageId } = props;
    const spec = contribution.spec;
    // Menu placements only carry button/static-menu/async-menu specs; a section
    // spec is a settings/profile shape and has no trigger here.
    if (spec.kind === "section") return null;
    const invoke = (actionId: string, value?: PluginContributionActionValue) =>
        surface.pluginContributionInvoke({
            contributionId: contribution.id,
            actionId,
            ...(value === undefined ? {} : { value }),
            ...(messageId ? { messageId } : {}),
        });
    const glyph = assetGlyphFactory(masks, contribution.installationId, 16);
    const kind = spec.kind;
    return (
        <PluginContributionMenuButton
            actionId={spec.kind === "button" ? spec.id : contribution.id}
            actionState={
                spec.kind === "button"
                    ? pluginActionUiState(
                          surface.actionStates.get(
                              pluginActionStateKey(contribution.id, spec.id, messageId),
                          ),
                      )
                    : undefined
            }
            assetGlyph={glyph}
            data-testid={`plugin-contribution-${contribution.id}`}
            description={contribution.description}
            iconOnly={props.iconOnly}
            itemActionState={(actionId) =>
                pluginActionUiState(
                    surface.actionStates.get(
                        pluginActionStateKey(contribution.id, actionId, messageId),
                    ),
                )
            }
            items={spec.kind === "staticMenu" ? spec.items : undefined}
            kind={kind}
            menuState={
                spec.kind === "asyncMenu"
                    ? pluginMenuUiState(
                          surface.menuStates.get(pluginMenuStateKey(contribution.id, messageId)),
                      )
                    : undefined
            }
            onMenuOpen={
                spec.kind === "asyncMenu"
                    ? () => surface.pluginContributionMenuResolve(contribution.id, messageId)
                    : undefined
            }
            onInvoke={invoke}
            size={props.size}
            triggerGlyph={
                spec.kind === "button" ? (
                    <PluginAssetGlyph
                        maskUrl={masks.maskUrl(contribution.installationId, spec.assetId)}
                        size={16}
                    />
                ) : undefined
            }
            variant={props.variant}
            title={contribution.title}
        />
    );
}

/** The placements shown as menu-style triggers in the chat conversation surface. */
const COMPOSER_PLACEMENTS = new Set(["composerIcon", "composerMenu"]);

function menuNodes(
    contributions: readonly PluginContributionSummary[],
    surface: ContributionSurface,
    masks: PluginAssetMasks,
    options?: {
        messageId?: string;
        iconOnlyFor?: (contribution: PluginContributionSummary) => boolean;
    },
): ReactNode {
    if (contributions.length === 0) return undefined;
    return contributions.map((contribution) => (
        <PluginMenuContribution
            contribution={contribution}
            iconOnly={options?.iconOnlyFor?.(contribution)}
            key={contribution.id}
            masks={masks}
            messageId={options?.messageId}
            surface={surface}
        />
    ));
}

/** Builds the composer-toolbar contribution triggers (composerIcon + composerMenu). */
export function composerContributionNodes(
    contributions: readonly PluginContributionSummary[],
    surface: ContributionSurface,
    masks: PluginAssetMasks,
): ReactNode {
    const items = contributions.filter((item) => COMPOSER_PLACEMENTS.has(item.location));
    return menuNodes(items, surface, masks, {
        iconOnlyFor: (item) => item.location === "composerIcon",
    });
}

/** Builds the conversation-header contribution triggers (chatMenu). */
export function chatMenuContributionNodes(
    contributions: readonly PluginContributionSummary[],
    surface: ContributionSurface,
    masks: PluginAssetMasks,
): ReactNode {
    const items = contributions.filter((item) => item.location === "chatMenu");
    return menuNodes(items, surface, masks);
}

/** Builds one message's message-menu contribution triggers, bound to its id. */
export function messageMenuContributionNodes(
    contributions: readonly PluginContributionSummary[],
    surface: ContributionSurface,
    masks: PluginAssetMasks,
    messageId: string,
): ReactNode {
    const items = contributions.filter((item) => item.location === "messageMenu");
    return menuNodes(items, surface, masks, { messageId });
}
