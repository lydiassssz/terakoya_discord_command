import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import fetch from "node-fetch"; // Node.js 18 以降の Lambda なら fetch がグローバルにある場合もあります
// ↑ ない場合は node-fetch or axios を同梱してご利用ください

export const handler = async (event) => {
  // Bot Token は環境変数などから読み込んでください
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error("DISCORD_BOT_TOKEN が定義されていません。");
    return;
  }

  const dynamoDbClient = new DynamoDBClient({});

  for (const record of event.Records) {
    // INSERT イベントのみを処理
    if (record.eventName === "INSERT") {
      const newImage = record.dynamodb.NewImage;
      const quizId = newImage.quizId.S;
      const answererId = newImage.answererId.S;
      const answerContent = newImage.answerContent.S;

      try {
        // 1. quizId-index を使って Terakoya_quiz から該当するアイテムを取得
        //    quizId をパーティションキー(GSI)として検索します
        const queryParams = {
          TableName: "Terakoya_quiz",  // テーブル名
          IndexName: "quizId-index",   // 作成したGSIの名前
          KeyConditionExpression: "quizId = :q",
          ExpressionAttributeValues: {
            ":q": { S: quizId },
          },
          Limit: 1, // 該当が複数ある場合は1件のみ取得
        };

        const queryResult = await dynamoDbClient.send(new QueryCommand(queryParams));
        const items = queryResult.Items || [];

        if (items.length === 0) {
          console.warn(`Terakoya_quiz に quizId=${quizId} のレコードが見つかりません。`);
          continue; // 次のrecordへ
        }

        // 取得した1件目を使用
        const item = items[0];
        // channelId という属性がテーブルに存在すると仮定
        const channelId = item.channelId?.S;
        if (!channelId) {
          console.warn(`クイズ情報に channelId がありません (quizId=${quizId})`);
          continue;
        }

        console.log(`Found channelId=${channelId} for quizId=${quizId}.`);

          // 2. 解答チャンネルにメッセージを投稿
        const postUrl = `https://discord.com/api/v10/channels/${channelId}/messages`;
        const postBody = {
          content: `【新規解答】\n回答者: \n\`\`\`\n${answerContent}\n\`\`\``,
        };

        await fetch(postUrl, {
          method: "POST",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(postBody),
        });

        console.log(`Posted answer (anonymous) to channelId=${channelId}.`);


        // 3. チャンネル閲覧権限を回答者に付与する (Permission Overwrite)
        const permissionUrl = `https://discord.com/api/v10/channels/${channelId}/permissions/${answererId}`;
        // VIEW_CHANNEL(1024) + SEND_MESSAGES(2048) = 3072
        const permissionBody = {
          allow: (1024 + 2048).toString(),
          deny: "0",
          type: 1, // 1=Member, 0=Role
        };

        await fetch(permissionUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(permissionBody),
        });

        console.log(`Granted channel permissions to userId=${answererId}`);
      } catch (err) {
        console.error("エラーが発生しました: ", err);
        // 必要に応じてリトライや通知などの処理を実装
      }
    }
  }
};
