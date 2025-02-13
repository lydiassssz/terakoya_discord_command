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
    return await handleSlashCommand(body);
  }

  // メッセージコンポーネント (type=3) - ボタン、セレクトメニューなど
  if (body.type === 3) {
    return await handleComponentInteraction(body);
  }

  // モーダル送信 (type=5)
  if (body.type === 5) {
    return handleModalInteraction(body);
  }

  // その他未対応
  return {
    statusCode: 404,
    body: "未対応のリクエストです",
  };
}
