// modalInteraction.mjs
import { respondJSON, sendLogMessage } from "../utils.mjs";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import dotenv from "dotenv";

export async function handleModalInteraction(body) {
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const customId = body.data?.custom_id || "";

  if (customId.startsWith("makeQuizModal")) {
    return await handleQuizModalSubmit(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
  }

  // 何も該当しなければACKで終了
  return respondJSON({ type: 6 });
}

async function handleQuizModalSubmit(body, botToken, logChannelId) {
  // custom_id: "makeQuizModal|<channelId>" をパースする
  const [modalName, selectedChannelId] = body.data.custom_id.split("|");

  // TextInput フィールドを取得
  const fields = extractModalFields(body.data.components);
  const quizText = fields.quizText;

  // ここで DynamoDB に登録する
  const ddbClient = new DynamoDBClient({});

  // 送信された時刻などを保存する例 (Timestamp は現在時刻をミリ秒で)
  const now = Date.now();

  const TableName = process.env.DYNAMODB_QUIZ_TABLE_NAME;

  const params = {
    TableName: TableName,
    Item: {
      Id:        { S: selectedChannelId },     // セレクトメニューで選んだチャンネルID
      Timestamp: { S: now.toString() },        // 送信された時刻(ミリ秒)
      QuizText:  { S: quizText },             // モーダルで入力された問題文
      // 必要に応じて他の情報を追加
      // QuizNumber: { S: quizNumber }, など
    },
  };

  await ddbClient.send(new PutItemCommand(params));

  // #bot_log に投稿する等のログ処理
  await sendLogMessage(body, botToken, logChannelId);

  // ユーザーへの返信 (エフェメラル)
  return respondJSON({
    type: 4,
    data: {
      content: `クイズ情報を受け付けました。\nチャンネル: <#${selectedChannelId}>\n問題文: ${quizText}`,
      flags: 64, // エフェメラル
    },
  });
}

function extractModalFields(components = []) {
  const fields = {};
  for (const row of components) {
    if (!row.components) continue;
    for (const comp of row.components) {
      if (comp.type === 4 && comp.custom_id) {
        fields[comp.custom_id] = comp.value || "";
      }
    }
  }
  return fields;
}