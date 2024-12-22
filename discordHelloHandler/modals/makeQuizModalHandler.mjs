import { respondJSON } from "../utils.mjs";
import { sendLogMessage } from "../utils.mjs";

// モーダル送信: "makeQuizModal"
export async function handleMakeQuizModalSubmit(body, botToken, logChannelId) {
  // custom_id: "makeQuizModal|{channelId}"
  const [modalId, selectedChannelId] = body.data.custom_id.split("|");

  // 入力欄を取得
  const fields = extractModalFields(body.data.components);
  const quizNumber = fields.quizNumber || "";
  const quizText = fields.quizText || "";

  // 任意: ボットログに記録
  await sendLogMessage(body, botToken, logChannelId);

  // ユーザーにはエフェメラル返信
  return respondJSON({
    type: 4,
    data: {
      content: `クイズ情報を受け付けました。\n**問題番号**: ${quizNumber}\n**問題文**:\n${quizText}`,
      flags: 64, // エフェメラル
    },
  });
}

// モーダル入力欄抽出の補助関数
function extractModalFields(components = []) {
  const result = {};
  for (const row of components) {
    for (const comp of row.components || []) {
      if (comp.type === 4 && comp.custom_id) {
        result[comp.custom_id] = comp.value || "";
      }
    }
  }
  return result;
}
