// modalInteraction.mjs
import { respondJSON } from "../utils.mjs";
import { handleQuizModalSubmit } from "../modals/makeQuizModalHandler.mjs";

export async function handleModalInteraction(body) {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const customId = body.data?.custom_id || "";

  if (customId.startsWith("makeQuizModal")) {
    return await handleQuizModalSubmit(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
  }

  // 何も該当しなければACKで終了
  return respondJSON({ type: 6 });
}

