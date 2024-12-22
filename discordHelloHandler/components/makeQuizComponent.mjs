// makeQuizComponent.mjs
import { respondJSON, sendLogMessage } from "../utils.mjs";

/**
 * セレクトメニュー "quizSelectMenu" が押されたとき
 *  -> モーダルを表示 (type:9)
 */
export async function handleQuizSelectMenu(body, botToken, logChannelId) {
  // ユーザーが選択したチャンネルID (1つだけ想定)
  const selectedChannelId = body.data.values?.[0];
  if (!selectedChannelId) {
    return respondJSON({
      type: 4,
      data: {
        content: "チャンネルが選択されていません。",
        flags: 64, // エフェメラル
      },
    });
  }

  // ボットログには "セレクトメニューが押された" という情報を残してもOK
  await sendLogMessage(body, botToken, logChannelId);

  // (例) モーダルを返す
  return respondJSON({
    type: 9, // MODAL
    data: {
      custom_id: `makeQuizModal|${selectedChannelId}`, 
      title: "クイズ情報入力",
      components: [
        {
          type: 1, // ActionRow
          components: [
            {
              type: 4, // TextInput
              custom_id: "quizNumber",
              label: "問題番号",
              style: 1, // SHORT
              placeholder: "例: Q1, 1 など",
              required: true,
            },
          ],
        },
        {
          type: 1, // ActionRow
          components: [
            {
              type: 4, // TextInput
              custom_id: "quizText",
              label: "問題文",
              style: 2, // PARAGRAPH
              placeholder: "問題文を入力",
              required: true,
            },
          ],
        },
      ],
    },
  });
}
