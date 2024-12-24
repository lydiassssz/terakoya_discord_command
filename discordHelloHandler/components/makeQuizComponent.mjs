// makeQuizComponent.mjs
import { respondJSON } from "../utils.mjs";

/**
 * セレクトメニュー "quizSelectMenu" が押されたとき
 *  -> モーダルを表示 (type:9)
 */
export async function handleQuizSelectMenu(body) {
  const selectedChannelId = body.data.values?.[0];
  if (!selectedChannelId) {
    return respondJSON({
      type: 4,
      data: {
        content: "チャンネルが選択されていません。",
        flags: 64,
      },
    });
  }

  return respondJSON({
    type: 9, // MODAL
    data: {
      // ここで custom_id にチャンネルIDを埋め込む
      custom_id: `makeQuizModal|${selectedChannelId}`,
      title: "クイズ情報入力フォーム",
      components: [
        {
          type: 1, // ActionRow
          components: [
            {
              type: 4, // TextInput
              custom_id: "quizText",
              label: "問題文",
              style: 2, // PARAGRAPH
              min_length: 1,
              max_length: 2000,
              placeholder: "ここに問題文を入力",
              required: true,
            },
          ],
        },
      ],
    },
  });
}
