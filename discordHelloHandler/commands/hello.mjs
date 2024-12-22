import { respondJSON, sendLogMessage } from "../utils.mjs";

export async function handleHelloCommand(body, botToken, logChannelId) {
  const user = body.member?.user || body.user;
  const username = user?.username || "不明なユーザー";

  await sendLogMessage(body, botToken, logChannelId);

  return respondJSON({
    type: 4,
    data: {
      content: `こんにちは、${username}さん！`,
      flags: 64, // エフェメラル
    },
  });
}
