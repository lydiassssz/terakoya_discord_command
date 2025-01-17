import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { CloudWatchLogsClient, PutLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import fetch from "node-fetch"; // Node.js 18 以降の Lambda なら省略可能

export const handler = async (event) => {
  // Discord Bot Token は環境変数などから取得
  const discordBotToken = process.env.DISCORD_BOT_TOKEN;
  const transactFunctionUrl = process.env.TRANSACT_FUNCTION_URL;

  // AWSクライアントを初期化
  const dynamoDbClient = new DynamoDBClient({});

  for (const record of event.Records) {
    if (record.eventName === "INSERT") {
      const newImage = record.dynamodb.NewImage;
      const quizId = newImage.quizId.S;
      const answererId = newImage.answererId.S;
      const answerContent = newImage.answerContent.S;

      try {
        // 1. quizId-index を使って Terakoya_quiz から該当するデータを取得
        const queryParams = {
          TableName: "Terakoya_quiz",
          IndexName: "quizId-index",
          KeyConditionExpression: "quizId = :q",
          ExpressionAttributeValues: {
            ":q": { S: quizId },
          },
          Limit: 1,
        };

        const queryResult = await dynamoDbClient.send(
          new QueryCommand(queryParams)
        );
        const items = queryResult.Items || [];

        const item = items[0];
        console.log("item:", item);
        const channelId = item.channelId?.S;
        console.log("CloudWatch Logs に item の内容を出力しました。");

        if (answerContent != "") {
          // 4. 回答者にトークンを100付与 (Function URL を使用)
            try {
              // Lambdaに渡すペイロード
              const payloadObject = {
                action: "transact",
                user_id: answererId, // tokenMarketHandler がユーザーIDとして解釈できるものを指定
                amount: 100, // 付与するトークン量
                description: `Answered for ${quizId}`,
              };

              const response = await fetch(transactFunctionUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payloadObject),
              });

              if (!response.ok) {
                const errorBody = await response.text();
                console.error(
                  `トークン付与失敗: ステータスコード ${response.status}, ${errorBody}`
                );
                throw new Error(`トークン付与失敗: ${response.status}`);
              }

              const result = await response.json();
              console.log("トークン付与成功:", result);
            } catch (invokeError) {
              console.error("トークン付与呼び出し時にエラーが発生:", invokeError);
            }


          // 2. 解答チャンネルにメッセージを投稿
          const postUrl = `https://discord.com/api/v10/channels/${channelId}/messages`;
          const postBody = {
            content: `【新規解答】\n\`\`\`\n${answerContent}\n\`\`\``,
          };

          await fetch(postUrl, {
            method: "POST",
            headers: {
              Authorization: `Bot ${discordBotToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(postBody),
          });

          console.log(`Posted answer (anonymous) to channelId=${channelId}.`);
        }

        // 3. チャンネル閲覧権限を回答者に付与する (Permission Overwrite)
        const permissionUrl = `https://discord.com/api/v10/channels/${channelId}/permissions/${answererId}`;
        const permissionBody = {
          allow: (1024 + 2048).toString(), // VIEW_CHANNEL(1024) + SEND_MESSAGES(2048) = 3072
          deny: "0",
          type: 1, // 1=Member, 0=Role
        };

        await fetch(permissionUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bot ${discordBotToken}`,
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
