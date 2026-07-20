export type ChatWorkspaceTarget =
    | {
          chatId: string;
          source: "channel";
          workspaceChatId?: string;
      }
    | {
          chatId: string;
          source: "rig";
          cwd: string;
      };
