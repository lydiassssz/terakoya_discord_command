import { respondJSON,checkIfUserAlreadyAnswered } from "../utils.mjs";

/**
 * クイズを見るボタンを押した際に呼び出される関数。
 * 既に閲覧権限取得済みユーザーの場合はエラーメッセージを返し、
 * 未回答の場合はクイズ回答用のモーダルを返す。
 *
 * @param {Object} body - Discordから送られるInteractionのボディ
 * @returns {Object} respondJSONで返すべきレスポンスオブジェクト
 */
export function handleViewAnswerButton(body) {
  // DiscordのInteractionボディから必要な情報を取り出す
  const userId = body?.member?.user?.id;
  const messageId = body?.message?.id;

  // すでに閲覧権限取得済みかどうかのチェック
  const alreadyAnswered = checkIfUserAlreadyAnswered(userId, messageId);

  if (alreadyAnswered) {
    return respondJSON({
      type: 4,
      data: {
        content: "既に閲覧可能なチャンネルにアクセスしようとしています",
        flags: 64,
      },
    });
  } else {
    return respondJSON({
      type: 9,
      data: {
        custom_id: `answer_view_modal_${messageId}`,
        title: "みんなの答えを見る",
        components: [
          {
            // Action Row
            type: 1,
            components: [
              {
                // Button
                type: 2,
                style: 1,
                custom_id: "confirm_view",
                label: "実行には100EDUを使用します",
              },
            ],
          },
        ],
      },
    });
  }
};
