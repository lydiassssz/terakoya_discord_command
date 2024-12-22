import { handleSlashCommand } from "./interactions/slashCommands.mjs";
import { handleComponentInteraction } from "./interactions/componentInteraction.mjs";
import { handleModalInteraction } from "./interactions/modalInteraction.mjs";
// ↓ サーバーレスでJSONレスポンスを作るユーティリティを想定 (無い場合は直接returnしてもOK)
import { respondJSON } from "./utils.mjs";

/**
 * body.typeが2ならスラッシュコマンド
 * body.typeが3ならコンポーネント押下(ボタンなど)
 * body.typeが5ならモーダル送信
 */
export async function handlerSlashOrInteraction(body) {
  // Ping (type:1)
  if (body.type === 1) {
    // DiscordがPingしてきたときのPong応答 (必須)
    return respondJSON({ type: 1 });
  }

  // スラッシュコマンド (type=2)
  if (body.type === 2) {
    const response = await handleSlashCommand(body);
    // responseは { type:..., data:... } の形を想定
    return respondJSON(response);
  }

  // メッセージコンポーネント (type=3) - ボタン、セレクトメニューなど
  if (body.type === 3) {
    const response = await handleComponentInteraction(body);
    return respondJSON(response);
  }

  // モーダル送信 (type=5)
  if (body.type === 5) {
    const response = await handleModalInteraction(body);
    return respondJSON(response);
  }

  // その他未対応
  return {
    statusCode: 404,
    body: "未対応のリクエストです",
  };
}
