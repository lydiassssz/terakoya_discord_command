import { respondJSON, sendLogMessage, modifyUserChannelPermission, createDM, sendDM } from "../utils.js";

/**
 * ボタンなどのコンポーネント押下を処理
 */
export async function handleComponentInteraction(body) {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const customId = body.data?.custom_id || "";

  // "revert_access-" で始まっていれば閲覧権限を復元する
  if (customId.startsWith("revert_access-")) {
    const [_, channelId, userId] = customId.split("-");
    const success = await modifyUserChannelPermission(channelId, userId, DISCORD_BOT_TOKEN, {
      allow: 0,
      deny: 0, // VIEW_CHANNEL をdenyしない => 復元
    });

    // 復元のログ送信
    await sendLogMessage(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);

    // DMで結果通知
    const dmChannelId = await createDM(userId, DISCORD_BOT_TOKEN);
    if (dmChannelId) {
      const message = success
        ? "権限が復元されました。再度チャンネルを閲覧できるはずです。"
        : "権限の復元に失敗しました。Botの権限を確認してください。";
      await sendDM(dmChannelId, message, null, DISCORD_BOT_TOKEN);
    }
  }

  // ボタンインタラクションには "type:6" でACKを返す (応答不要)
  return respondJSON({ type: 6 });
}
