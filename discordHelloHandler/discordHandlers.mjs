import {handleSlashCommand} from "./interactions/slashCommands.mjs";
import {handleComponentInteraction} from "./interactions/componentInteraction.mjs";
import {handleModalInteraction} from "./interactions/modalInteraction.mjs";

/**
 * body.typeが2ならスラッシュコマンド
 * body.typeが3ならコンポーネント押下(ボタンなど)
 */
export async function handlerSlashOrInteraction(body) {

  // Ping (type:1) 応答
  if (body.type === 1) {
    return res.json({ type: 1 });
  }

  // スラッシュコマンド (type=2)
  if (body.type === 2) {
    return await handleSlashCommand(body);
  }

  // メッセージコンポーネント (type:3) - ボタン、セレクトメニューなど
  if (body.type === 3) {
    const response = await handleComponentInteraction(body);
    return res.json(response);
  }

  // モーダル送信 (type:5)
  if (body.type === 5) {
    const response = await handleModalInteraction(body);
    return res.json(response);
  }

  // 未対応
  return { statusCode: 404, body: "未対応のリクエストです" };
}
