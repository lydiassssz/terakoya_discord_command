import dotenv from "dotenv";
import { respondJSON, sendLogMessage } from "../utils.mjs";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";

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

  // モーダルのカスタムIDから quizId を取得
  const customId = body?.data?.custom_id || "";
  const quizId = customId.replace("answer_view_modal_", "");

  // ユーザーIDを取得
  const viewerId = body?.member?.user?.id;

  try {
    await client.send(new PutItemCommand(params));

    // lambda関数tokenMarketHandlerのtransact_token関数にリクエストを送る
    const response = await fetch(process.env.TRANSACT_FUNCTION_URL, {
      method: "POST",
      headers: {
      "Content-Type": "application/json",
      },
      body: JSON.stringify({
      action: "transact",
      user_id: viewerId,
      amount: -100,
      description: `Purchase item for quiz ${quizId}`,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Lambda function request failed");
    }

    await sendLogMessage(body, botToken, logChannelId);

  } catch (err) {
    await sendLogMessage(body, botToken, logChannelId);

    // ユーザーへはエラーメッセージを返す
    return respondJSON({
      type: 4,
      data: {
        content: "エラーが発生しました。申し訳ありませんが、現在の状況をサーバー開発者に確認して頂けると助かります。エラー発生箇所#makeViewAnswerModalHandler",
        flags: 64,
      },
    });
  }

  // 4. DynamoDBへ書き込み
    const client = new DynamoDBClient({});
    try {
      const params = {
        TableName: process.env.DYNAMODB_ANSWER_TABLE_NAME,
        Item: {
          quizId: { S: quizId },
          answererId: { S: viewerId },
          answerContent: { S: "" },
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
          content: "エラーが発生しました。申し訳ありませんが、現在の状況をサーバー開発者に確認して頂けると助かります。エラー発生箇所#makeViewAnswerModalHandler",
          flags: 64, // 64: EPHEMERAL (本人のみ見えるメッセージ)
        },
      });
    }

  // 6. ユーザーへのレスポンス (Ephemeral メッセージ)
  return respondJSON({
    type: 4,
    data: {
      content: "EDUの支払いが完了しました！",
      flags: 64,
    },
  });
}
