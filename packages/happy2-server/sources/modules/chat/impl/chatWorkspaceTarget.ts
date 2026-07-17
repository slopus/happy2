export type ChatWorkspaceTarget =
    | {
          chatId: string;
          source: "channel";
      }
    | {
          chatId: string;
          source: "rig";
          cwd: string;
      };
