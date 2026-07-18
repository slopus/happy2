import { AdminPage, type AdminPageSection } from "happy2-ui";
import type { HappyState } from "happy2-state";
import { usePluginIcons } from "../pluginIcons";

export interface AdminViewProps {
    state: HappyState;
    section: AdminPageSection;
    onSectionChange: (section: AdminPageSection) => void;
}

export function AdminView(props: AdminViewProps) {
    const icons = usePluginIcons(props.state);
    return (
        <AdminPage
            activeSection={props.section}
            agentImagesStore={() => props.state.agentImages()}
            agentSecretsStore={() => props.state.agentSecrets()}
            onSectionChange={props.onSectionChange}
            pluginIconUrl={icons.iconUrl}
            pluginsStore={() => props.state.plugins()}
            store={props.state.admin()}
        />
    );
}
