import dotenv from "dotenv";
import { respondJSON } from "../utils.mjs";
import { PutItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { CloudWatchLogsClient, PutLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";

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
export async function handleViewAnswerModalSubmit(body, botToken, logChannelId) {
  dotenv.config();

  // モーダルのカスタムIDから quizId を取得
  const customId = body?.data?.custom_id || "";
  const quizId = customId.replace("answer_view_modal_", "");

  // ユーザーIDを取得
  const viewerId = body?.member?.user?.id;

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

  // 4. DynamoDBへ書き込み
  const client = new DynamoDBClient({});
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
  // 6. ユーザーへのレスポンス (Ephemeral メッセージ)
  return respondJSON({
    type: 4,
    data: {
      content: "EDUの支払いが完了しました！",
      flags: 64,
    },
  });
}


  
