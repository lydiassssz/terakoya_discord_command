import {
    respondJSON,
    sendLogMessage,
    getChannelInfo,
    modifyUserChannelPermission,
    createDM,
    sendDM,
    VIEW_CHANNEL
  } from "../utils.mjs";
  
  export async function handleRemoveAccessCommand(body, botToken, logChannelId) {
    const channelId = body.channel_id;
    const userId = body.member?.user?.id;
  
    // 1) チャンネル情報取得
    const channelInfo = await getChannelInfo(channelId, botToken);
    if (!channelInfo) {
      return respondJSON({
        type: 4,
        data: {
          content: "チャンネル情報を取得できなかったため、処理を中断しました。",
          flags: 64,
        },
      });
    }
  
    const categoryName = channelInfo.parent_name || "未分類";
    const channelName = channelInfo.name || "不明なチャンネル";
    const formattedChannel = `${categoryName}:${channelName}`;
  
    // 2) 閲覧権限の剥奪
    const success = await modifyUserChannelPermission(channelId, userId, botToken, {
      allow: 0,
      deny: VIEW_CHANNEL,
    });
  
    // 3) コマンド実行ログ
    await sendLogMessage(body, botToken, logChannelId);
  
    if (!success) {
      return respondJSON({
        type: 4,
        data: {
          content: "権限の剥奪に失敗しました。Botの権限を確認してください。",
          flags: 64,
        },
      });
    }
  
    // 4) DM送信 (復元ボタン付き)
    const dmChannelId = await createDM(userId, botToken);
    if (dmChannelId) {
      const customId = `revert_access-${channelId}-${userId}`;
      await sendDM(
        dmChannelId,
        `権限が剥奪されました: **${formattedChannel}**\n「復元」ボタンを押すと閲覧権限を元に戻せます。`,
        customId,
        botToken
      );
    }
  
    // 5) エフェメラルメッセージ
    return respondJSON({
      type: 4,
      data: {
        content: `${formattedChannel} の閲覧権限を剥奪しました。DMを確認してください。`,
        flags: 64,
      },
    });
  }
  