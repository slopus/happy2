export interface AreaReconcileContext {
    chatReconcile(chatId: string): void;
    workspaceReconcile(chatId: string): void;
    callsReconcile(): void;
    threadsReconcile(): void;
    notificationsReconcile(): void;
    agentImagesReconcile(): void;
    setupReconcile(): void;
    agentSecretsReconcile(): void;
    identitiesReconcile(): void;
    unknownArea(area: string): void;
}

/** Routes server-owned difference areas to one product owner and exposes unknown areas instead of silently staling. */
export function areaReconcile(context: AreaReconcileContext, area: string): void {
    if (area.startsWith("chat:")) {
        const chatId = area.slice("chat:".length);
        if (chatId) context.chatReconcile(chatId);
        else context.unknownArea(area);
    } else if (area.startsWith("workspace:")) {
        const chatId = area.slice("workspace:".length);
        if (chatId) context.workspaceReconcile(chatId);
        else context.unknownArea(area);
    } else if (area === "calls" || area.startsWith("call:")) context.callsReconcile();
    else if (area === "threads" || area.startsWith("thread:")) context.threadsReconcile();
    else if (area === "notifications") context.notificationsReconcile();
    else if (area === "agent-images") {
        // Base-image build progress reaches both the admin catalog and the
        // onboarding surface, so a durable image change reconciles each owner.
        context.agentImagesReconcile();
        context.setupReconcile();
    } else if (area === "setup" || area === "user-onboarding") context.setupReconcile();
    else if (area === "agent-secrets") context.agentSecretsReconcile();
    else if (area === "users" || area === "profile") context.identitiesReconcile();
    else context.unknownArea(area);
}
