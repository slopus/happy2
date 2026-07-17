export function slashEventType(commandId: string): string {
    return `slash_command:${commandId}`;
}
