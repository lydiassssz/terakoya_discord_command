// modalInteraction.mjs
import { respondJSON, sendLogMessage } from "../utils.mjs";
import { handleMakeQuizModalSubmit } from "../components/makeQuizComponent.mjs";

export async function handleModalInteraction(body) {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const customId = body.data?.custom_id || "";

  // 例: "makeQuizModal|999999999999"
  if (customId.startsWith("makeQuizModal")) {
    return await handleMakeQuizModalSubmit(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
  }

  // 何も該当しなければACKで終了
  return respondJSON({ type: 6 });
}
