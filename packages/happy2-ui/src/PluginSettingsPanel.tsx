import type { ReactNode } from "react";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Switch } from "./Switch";

export interface PluginSettingsAppRow {
    id: string;
    title: string;
    description?: string;
    /** The instance's monochrome glyph (a `PluginAssetGlyph`). */
    glyph?: ReactNode;
    hidden: boolean;
    available: boolean;
    /** A presentation update (hide/unhide/reorder) is in flight. */
    busy?: boolean;
    /** The last presentation-update failure, shown inline. */
    error?: string;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export interface PluginSettingsPanelProps {
    apps: readonly PluginSettingsAppRow[];
    /** Toggles per-user visibility of one instance (never widens audience). */
    onHiddenChange(id: string, hidden: boolean): void;
    onMoveUp(id: string): void;
    onMoveDown(id: string): void;
    /** Rendered `pluginSettings` contribution sections. */
    contributions?: ReactNode;
    className?: string;
    "data-testid"?: string;
}

/**
 * C-138 PluginSettingsPanel — the user-facing Apps & plugin settings surface. It
 * lists every durable app instance visible to the viewer (including their hidden
 * ones), with immediate native controls to hide/unhide and reorder through the
 * owner's `appPresentationUpdate`, plus clear pending/error feedback. Beneath the
 * list it renders `pluginSettings` contribution sections. Per-user preferences
 * only reorder/hide the viewer's own presentation; they never grant access.
 *
 * Props only: the owner subscribes once to plugin navigation and passes immutable
 * rows and callbacks; the panel performs no transport.
 */
export function PluginSettingsPanel(props: PluginSettingsPanelProps) {
    return (
        <div
            className={["happy2-plugin-settings", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="plugin-settings"
            data-testid={props["data-testid"]}
        >
            <section
                className="happy2-plugin-settings__group"
                data-happy2-ui="plugin-settings-apps"
            >
                <header className="happy2-plugin-settings__group-head">
                    <span className="happy2-plugin-settings__group-title">Apps</span>
                    <span className="happy2-plugin-settings__group-description">
                        Show, hide, and reorder the apps in your sidebar.
                    </span>
                </header>
                {props.apps.length === 0 ? (
                    <EmptyState
                        description="Apps installed by your plugins appear here."
                        icon="spark"
                        size="inline"
                        title="No apps yet"
                    />
                ) : (
                    <ul
                        className="happy2-plugin-settings__list"
                        data-happy2-ui="plugin-settings-list"
                    >
                        {props.apps.map((app) => (
                            <li
                                className="happy2-plugin-settings__row"
                                data-happy2-ui="plugin-settings-row"
                                data-hidden={app.hidden ? "" : undefined}
                                data-item-id={app.id}
                                key={app.id}
                            >
                                {app.glyph ? (
                                    <span
                                        className="happy2-plugin-settings__glyph"
                                        aria-hidden="true"
                                    >
                                        {app.glyph}
                                    </span>
                                ) : null}
                                <span className="happy2-plugin-settings__label">
                                    <span className="happy2-plugin-settings__title">
                                        {app.title}
                                        {app.available ? null : (
                                            <Badge label="UNAVAILABLE" variant="neutral" />
                                        )}
                                    </span>
                                    {app.description ? (
                                        <span className="happy2-plugin-settings__description">
                                            {app.description}
                                        </span>
                                    ) : null}
                                    {app.error ? (
                                        <span
                                            className="happy2-plugin-settings__error"
                                            role="alert"
                                        >
                                            {app.error}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="happy2-plugin-settings__controls">
                                    <Button
                                        aria-label={`Move ${app.title} up`}
                                        disabled={!app.canMoveUp || app.busy}
                                        onClick={() => props.onMoveUp(app.id)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Up
                                    </Button>
                                    <Button
                                        aria-label={`Move ${app.title} down`}
                                        disabled={!app.canMoveDown || app.busy}
                                        icon="chevron-down"
                                        onClick={() => props.onMoveDown(app.id)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Down
                                    </Button>
                                    <Switch
                                        aria-label={`Show ${app.title} in the sidebar`}
                                        checked={!app.hidden}
                                        disabled={app.busy}
                                        onChange={(shown) => props.onHiddenChange(app.id, !shown)}
                                        size="small"
                                    />
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
            {props.contributions ? (
                <section
                    className="happy2-plugin-settings__group"
                    data-happy2-ui="plugin-settings-contributions"
                >
                    {props.contributions}
                </section>
            ) : null}
        </div>
    );
}
