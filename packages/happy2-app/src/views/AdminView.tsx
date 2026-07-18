import { AdminPage, type AdminPageSection } from "happy2-ui";
import type { HappyState } from "happy2-state";

export interface AdminViewProps {
    state: HappyState;
    section: AdminPageSection;
    onSectionChange: (section: AdminPageSection) => void;
}

export function AdminView(props: AdminViewProps) {
    return (
        <AdminPage
            activeSection={props.section}
            agentImagesStore={() => props.state.agentImages()}
            agentSecretsStore={() => props.state.agentSecrets()}
            onSectionChange={props.onSectionChange}
            store={props.state.admin()}
        />
    );
}
