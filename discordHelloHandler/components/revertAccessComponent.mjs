// revertAccessComponent.mjs
import { sendLogMessage, modifyUserChannelPermission, createDM, sendDM } from "../utils.mjs";

/**
 * "revert_access-{channelId}-{userId}" ボタンが押されたときの処理
 */
export async function handleRevertAccessButton(body, botToken, logChannelId) {
  const customId = body.data?.custom_id || "";
  // "revert_access-xxxxx-yyyyy" → 3要素に分割
  const [_, channelId, userId] = customId.split("-");

  // 1) 閲覧権限の復元
  const success = await modifyUserChannelPermission(channelId, userId, botToken, {
    allow: 0,
    deny: 0, // VIEW_CHANNEL をdenyしない => 復元
  });

  // 2) ログ送信
  await sendLogMessage(body, botToken, logChannelId);

  // 3) DMで結果通知
  const dmChannelId = await createDM(userId, botToken);
  if (dmChannelId) {
    const message = success
      ? "権限が復元されました。再度チャンネルを閲覧できるはずです。"
      : "権限の復元に失敗しました。Botの権限を確認してください。";
    await sendDM(dmChannelId, message, null, botToken);
  }
}
