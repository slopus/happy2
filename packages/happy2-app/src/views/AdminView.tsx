import { AdminPage, type AdminPageSection } from "happy2-ui";
import type { AdminSection, HappyState } from "happy2-state";
import { usePluginIcons } from "../pluginIcons";

export interface AdminViewProps {
    state: HappyState;
    section: AdminPageSection;
    sections: readonly AdminPageSection[];
    canManageImages: boolean;
    canManageSecrets: boolean;
    canAssignSecrets: boolean;
    canViewRoleMembers: boolean;
    onSectionChange: (section: AdminPageSection) => void;
}

export function AdminView(props: AdminViewProps) {
    const icons = usePluginIcons(props.state);
    const activeSection = props.sections.includes(props.section)
        ? props.section
        : (props.sections[0] ?? "users");
    return (
        <AdminPage
            activeSection={activeSection}
            agentImagesStore={() => props.state.agentImages()}
            agentSecretsStore={() => props.state.agentSecrets()}
            canAssignSecrets={props.canAssignSecrets}
            canManageImages={props.canManageImages}
            canManageSecrets={props.canManageSecrets}
            canViewRoleMembers={props.canViewRoleMembers}
            onSectionChange={props.onSectionChange}
            pluginIconUrl={icons.iconUrl}
            pluginInstallStore={() => props.state.pluginInstall()}
            pluginsStore={() => props.state.plugins()}
            rolesStore={() => props.state.roles()}
            sections={props.sections}
            store={() => props.state.admin(activeSection as AdminSection)}
            systemPluginImageUrl={icons.systemImageUrl}
        />
    );
}
