import dotenv from "dotenv";
import { respondJSON, sendLogMessage } from "../utils.mjs";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

/**
 * モーダル送信時に発火する関数です。
 *  - モーダルのcustom_idからquizIdを抽出
 *  - モーダルの入力値から回答内容を取得
 *  - DynamoDBに (quizId, answererId) をキーとして登録
 *  - 結果をログ送信(sendLogMessage)
 *  - ユーザーにレスポンス
 *
 * @param {Object} body - Discord から送られる Interaction body
 * @param {string} botToken - Botのトークン(ログ送信に使用)
 * @param {string} logChannelId - ログを送る先のチャンネルID
 * @returns {Object} - respondJSONで返すべきレスポンスオブジェクト
 */
export async function handleAnswerModalSubmit(body, botToken, logChannelId) {
  dotenv.config();

  // 1. モーダルのカスタムIDから quizId を取得
  const customId = body?.data?.custom_id || "";
  const quizId = customId.replace("quiz_modal_", "");

  // 2. 回答者ID(ユーザーID)を取得
  const answererId = body?.member?.user?.id;

  // 3. モーダルのテキスト入力内容を取得
  let userAnswer = "";
  const components = body?.data?.components || [];
  for (const row of components) {
    for (const comp of row.components) {
      if (comp.custom_id === "quiz_answer") {
        userAnswer = comp.value;
      }
    }
  }

  // 4. DynamoDBへ書き込み
  const client = new DynamoDBClient({});
  try {
    const params = {
      TableName: process.env.DYNAMODB_ANSWER_TABLE_NAME,
      Item: {
        quizId: { S: quizId },
        answererId: { S: answererId },
        answerContent: { S: userAnswer },
        createdAt: { S: new Date().toISOString() },
      },
    };
    await client.send(new PutItemCommand(params));

    // 5. ログ送信 (モーダルの内容をDiscordに投稿)
    //    sendLogMessageは body からユーザ名, custom_id, 入力値等を自動で取得して送信します
    await sendLogMessage(body, botToken, logChannelId);

  } catch (err) {
    // エラーが発生した場合も必要に応じてログを送信可能
    // （ただし送信内容は「モーダル送信」ログとして出力される点に注意）
    await sendLogMessage(body, botToken, logChannelId);

    // ユーザーへはエラーメッセージを返す
    return respondJSON({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        content: "エラーが発生しました。もう一度お試しください。",
        flags: 64, // 64: EPHEMERAL (本人のみ見えるメッセージ)
      },
    });
  }

  // 6. ユーザーへのレスポンス (Ephemeral メッセージ)
  return respondJSON({
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      content: "回答を受け付けました！",
      flags: 64, // 64: EPHEMERAL (本人のみ見えるメッセージ)
    },
  });
}
