import {
  handleSlashCommand, 
  handleComponentInteraction
} from "./commands/index.mjs"; // commands/配下のindex.jsからimport

/**
 * body.typeが2ならスラッシュコマンド
 * body.typeが3ならコンポーネント押下(ボタンなど)
 */
export async function handlerSlashOrInteraction(body) {
  // スラッシュコマンド (type=2)
  if (body.type === 2) {
    return await handleSlashCommand(body);
  }

  // コンポーネント (type=3)
  if (body.type === 3) {
    return await handleComponentInteraction(body);
  }

  // 未対応
  return { statusCode: 404, body: "未対応のリクエストです" };
}
