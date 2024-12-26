//makeQuizModalHandler.mjs

import { respondJSON,sendLogMessage } from "../utils.mjs";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function handleQuizModalSubmit(body, botToken, logChannelId) {
  // custom_id: "makeQuizModal|<channelId>" をパースする
  const [modalName, selectedChannelId] = body.data.custom_id.split("|");

  // TextInput フィールドを取得
  const fields = extractModalFields(body.data.components);
  const quizTitle = fields.quizTitle;
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
      QuizTitle:  { S: quizTitle },             // モーダルで入力された問題文
      QuizText:   { S: quizText },              // モーダルで入力された問題文
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
