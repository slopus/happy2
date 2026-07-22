import type { ReactNode } from "react";
import { Button } from "./Button";
import { Sidebar, type SidebarItem } from "./Sidebar";

export interface SidebarAppEntry {
    /** The durable app instance id (stable navigation identity). */
    id: string;
    title: string;
    /** A same-origin blob URL for the instance's authenticated monochrome glyph. */
    maskUrl?: string;
    /** Whether the instance is currently runnable; unavailable rows read muted. */
    available: boolean;
}

export interface SidebarAppsSectionProps {
    apps: readonly SidebarAppEntry[];
    /** The instance shown in the primary surface, highlighted in the list. */
    activeAppId?: string;
    onAppSelect(id: string): void;
    /** Returns to the chat list (drill-down back affordance). */
    onBack?(): void;
    /** Sidebar-menu contribution triggers, rendered in the footer. */
    menu?: ReactNode;
    /** Opens the Plugins & Apps settings for hide/unhide/order management. */
    onManage?(): void;
    headerAccessory?: ReactNode;
    manageLabel?: string;
    className?: string;
    "data-testid"?: string;
}

/**
 * C-137 SidebarAppsSection — the plural "Apps" navigation column. It composes the
 * shared {@link Sidebar} with one Apps section whose rows are the viewer's
 * visible `sidebar`-presentation app instances, each stable-keyed by instance id
 * and painted with its authenticated monochrome glyph. Unavailable instances
 * stay in place but read muted. Sidebar-menu contributions render in the footer
 * and a manage affordance opens the settings surface. It is the single product
 * sidebar for the Apps area (analogous to the admin drill-down), never a second
 * parallel sidebar.
 *
 * Props only: the owner subscribes once to the plugin navigation store and fans
 * out immutable entries here; rows do not subscribe individually.
 */
export function SidebarAppsSection(props: SidebarAppsSectionProps) {
    const items: SidebarItem[] = props.apps.map((app) => ({
        id: app.id,
        kind: "app",
        label: app.title,
        maskUrl: app.maskUrl,
        archived: !app.available,
        ...(app.available ? {} : { meta: "Unavailable" }),
    }));
    const footer = (
        <div className="happy2-sidebar-apps__footer" data-happy2-ui="sidebar-apps-footer">
            {props.menu ? (
                <div className="happy2-sidebar-apps__menu" data-happy2-ui="sidebar-apps-menu">
                    {props.menu}
                </div>
            ) : null}
            {props.onManage ? (
                <Button
                    fullWidth
                    icon="settings"
                    onClick={props.onManage}
                    size="small"
                    variant="ghost"
                >
                    {props.manageLabel ?? "Manage apps"}
                </Button>
            ) : null}
        </div>
    );
    return (
        <Sidebar
            activeItemId={props.activeAppId ?? ""}
            className={props.className}
            data-testid={props["data-testid"]}
            footer={props.menu || props.onManage ? footer : undefined}
            headerAccessory={props.headerAccessory}
            onBack={props.onBack}
            onItemSelect={props.onAppSelect}
            onSectionAction={props.onManage ? () => props.onManage?.() : undefined}
            sections={[
                {
                    id: "apps",
                    label: "Apps",
                    items,
                    empty: {
                        actionLabel: props.manageLabel ?? "Manage apps",
                        description: "No apps are installed yet.",
                        icon: "spark",
                        title: "No apps",
                    },
                },
            ]}
            title="Apps"
        />
    );
}
