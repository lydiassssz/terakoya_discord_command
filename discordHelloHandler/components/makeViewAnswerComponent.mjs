import { respondJSON,checkIfUserAlreadyAnswered } from "../utils.mjs";

/**
 * クイズを見るボタンを押した際に呼び出される関数。
 * 既に閲覧権限取得済みユーザーの場合はエラーメッセージを返し、
 * 未回答の場合はクイズ回答用のモーダルを返す。
 *
 * @param {Object} body - Discordから送られるInteractionのボディ
 * @returns {Object} respondJSONで返すべきレスポンスオブジェクト
 */
export async function handleViewAnswerButton(body) {
  // DiscordのInteractionボディから必要な情報を取り出す
  const userId = body?.member?.user?.id;
  const messageId = body?.message?.id;

  if (await checkIfUserAlreadyAnswered(userId, messageId) === true) {
    return respondJSON({
      type: 4,
      data: {
        content: "既に閲覧可能なチャンネルにアクセスしようとしています",
        flags: 64,
      },
    });
  } else {
    return respondJSON({
      type: 9, // モーダルを返す
      data: {
        custom_id: `answer_view_modal_${messageId}`, // モーダルのID
        title: "支払い確認",
        components: [
          {
            type: 1, // Action Row
            components: [
              {
                // Text Input
                type: 4,
                custom_id: "answer_view",
                style: 2, // 2 -> パラグラフ形式（複数行）
                label: "100トークンを支払いますか？",
                required: false,
                min_length: 1,
                max_length: 100,
                placeholder:
                  "ここには何も記述する必要はありません",
              },
            ],
          },
        ],
      },
    });
  }
};
