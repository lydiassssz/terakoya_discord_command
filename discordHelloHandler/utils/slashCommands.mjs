import { respondJSON, sendLogMessage } from "../utils.mjs";
import { handleHelloCommand } from "../commands/hello.mjs";
import { handleSubjectMakeCommand } from "../commands/subjectMake.mjs";
import { handleRemoveAccessCommand } from "../commands/removeAccess.mjs";

/**
 * スラッシュコマンド受け取り → コマンド名で振り分け
 */
export async function handleSlashCommand(body) {
  // 環境変数やログチャンネルIDはここで取得
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const commandName = body.data.name;

  switch (commandName) {
    case "hello":
      return await handleHelloCommand(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);

    case "subject_make":
      return await handleSubjectMakeCommand(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);

    case "remove_access":
      return await handleRemoveAccessCommand(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);

    default:
      // 未対応コマンド
      await sendLogMessage(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
      return respondJSON({
        type: 4,
        data: { content: "未対応のコマンドです" },
      });
  }
}
