// componentInteraction.mjs
import { respondJSON } from "../utils.mjs";
import { handleRevertAccessButton } from "../components/revertAccessComponent.mjs";
import { handleQuizSelectMenu } from "../components/makeQuizComponent.mjs";
import { handleAnswerQuizButton } from "../components/makeAnswerComponent.mjs";
import { handleViewAnswerButton } from "../components/makeViewAnswerComponent.mjs";

export async function handleComponentInteraction(body) {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const customId = body.data?.custom_id || "";

  if (customId.startsWith("revert_access-")) {
    await handleRevertAccessButton(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
    return respondJSON({ type: 6 });
  }

  if (customId === "quizSelectMenu") {
    return await handleQuizSelectMenu(body);
  }

  if (customId === "answer_quiz") {
    return await handleAnswerQuizButton(body);
  }

  if (customId === "view_answer") {
    return await handleViewAnswerButton(body);
  }

  // ここまでで該当がなければ、とりあえずACKだけ返す
  return respondJSON({ type: 6 });
}
