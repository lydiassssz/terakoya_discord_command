// componentInteraction.mjs
import { respondJSON } from "../utils.mjs";
import { handleRevertAccessButton } from "../components/revertAccessComponent.mjs";
import { handleQuizSelectMenu } from "../components/makeQuizComponent.mjs";

export async function handleComponentInteraction(body) {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const customId = body.data?.custom_id || "";

  // 1) revert_access-xxxx
  if (customId.startsWith("revert_access-")) {
    await handleRevertAccessButton(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
    // ボタンインタラクションには "type:6" でACKを返す
    return respondJSON({ type: 6 });
  }

  // 2) make_quiz 用のセレクトメニュー "quizSelectMenu" など
  if (customId === "quizSelectMenu") {
    // ここではモーダルを返す or 何らかの返信を返す可能性があるので
    // 返り値をそのままreturn する
    return await handleQuizSelectMenu(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
  }

  // ここまでで該当がなければ、とりあえずACKだけ返す
  return respondJSON({ type: 6 });
}
