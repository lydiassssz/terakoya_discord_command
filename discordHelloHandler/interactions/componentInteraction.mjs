// componentInteraction.mjs
import { respondJSON } from "../utils.mjs";
import { handleRevertAccessButton } from "../components/revertAccessComponent.mjs";
import { handleQuizSelectMenu } from "../components/makeQuizComponent.mjs";
import { handleAnswerQuizButton } from "../components/makeAnswerComponent.mjs";

export async function handleComponentInteraction(body) {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const customId = body.data?.custom_id || "";

  if (customId.startsWith("revert_access-")) {
    await handleRevertAccessButton(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
    // ボタンインタラクションには "type:6" でACKを返す
    return respondJSON({ type: 6 });
  }

  if (customId === "quizSelectMenu") {
    return await handleQuizSelectMenu(body);
  }

  if (customId === "answer_quiz") {
    return await handleAnswerQuizButton(body);
  }

  // ここまでで該当がなければ、とりあえずACKだけ返す
  return respondJSON({ type: 6 });
}
