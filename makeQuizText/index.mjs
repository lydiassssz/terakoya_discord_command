import fetch from "node-fetch";
import dotenv from "dotenv";
import {
  DynamoDBClient,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb"; // UpdateItemCommand を追加
dotenv.config();


// todo 何だこのコードは。何をしているのかわからない。

//================================================
// 環境変数
//================================================
const DISCORD_BOT_TOKEN     = process.env.DISCORD_BOT_TOKEN;       // Botトークン
const BOT_LOG_CHANNEL_ID    = process.env.BOT_LOG_CHANNEL_ID;      // ログ出力先チャンネルID
const HAKOBUNE_CATEGORY_ID  = "1321014475700310107";    // カテゴリID
const GUILD_ID              = process.env.GUILD_ID;                // DiscordサーバーID
const DYNAMODB_QUIZ_TABLE_NAME     = process.env.DYNAMODB_QUIZ_TABLE_NAME;       // DynamoDBテーブル名

// Discord API のベースURL (v10を利用)
const DISCORD_API_BASE      = "https://discord.com/api/v10";

//================================================
// DynamoDB クライアント
//================================================
const dynamoClient = new DynamoDBClient({ region: "ap-northeast-1" });

//================================================
// Lambdaメインハンドラ
//================================================
export const handler = async (event) => {
  console.log("DynamoDB ストリームイベントを受信:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    // INSERT（新規登録）イベントに対してのみ処理を行う
    if (record.eventName === "INSERT") {
      try {
        // DynamoDB StreamsのNewImageを取り出し
        const newItem = record.dynamodb.NewImage;

        // レコードの属性を取得
        const forumChannelId = newItem?.Id?.S;
        const Timestamp      = newItem?.Timestamp?.S;
        const quizTitle      = newItem?.QuizTitle?.S || "新しいクイズ"; // 万が一無かったら仮タイトル
        const quizText       = newItem?.QuizText?.S || "問題文がありません。";

        console.log(`新しいデータを処理中: Id: ${forumChannelId}, QuizTitle: ${quizTitle}`);

        //================================================
        // 1) フォーラムチャンネル(forumChannelId)にスレッドを作成
        //    - 問題文 + 「回答する」ボタンを投稿
        //================================================
        const createThreadUrl = `${DISCORD_API_BASE}/channels/${forumChannelId}/threads`;

        // スレッドの名前（タイトル）
        const forumThreadName = quizTitle;
        
        // 「回答する」ボタンと「回答を見る」ボタンのコンポーネント
        const buttonComponent = {
          type: 1, // ActionRow
          components: [
            {
              type: 2,               // button
              label: '回答する',
              style: 1,             // PRIMARY ボタン
              custom_id: 'answer_quiz'  // ボタン押下時のID(別で処理を設定)
            },
            {
              type: 2,               // button
              label: '回答を見る',
              style: 2,             // SECONDARY ボタン
              custom_id: 'view_answer'  // ボタン押下時のID(別で処理を設定)
            }
          ]
        };

        // fetch で新規スレッド＋メッセージを作成
        let newMessageId = null;
        {
          const payload = {
            name: forumThreadName,
            auto_archive_duration: 60,  // スレッドの自動アーカイブ(1時間)
            rate_limit_per_user: 0,
            message: {
              content: quizText,
              components: [ buttonComponent ]
            }
          };

          const response = await fetch(createThreadUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("フォーラムスレッド作成に失敗:", errorText);
            continue; // 次のレコードへ
          }

          const data = await response.json();
          newMessageId = data.id;
          console.log("フォーラムスレッドを作成しました。メッセージID:", newMessageId);
        }

        //================================================
        // 2) 新しいテキストチャンネルを作成
        //    - カテゴリ： HAKOBUNE_CATEGORY_ID
        //    - 名前：問題文の先頭10文字
        //    - permission_overwrites は指定しない → カテゴリの権限継承
        //================================================
        const createChannelUrl = `${DISCORD_API_BASE}/guilds/${GUILD_ID}/channels`;
        const newChannelName   = quizTitle; // 先頭10文字

        let newChannelId = null;
        let newChannelNameResponse = null;

        {
          const payload = {
            name: newChannelName,
            type: 0, // 0 = GUILD_TEXT
            parent_id: HAKOBUNE_CATEGORY_ID
            // permission_overwrites: [] を指定しなければカテゴリの権限同期
          };

          const response = await fetch(createChannelUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("テキストチャンネル作成に失敗:", errorText);
            continue; // 次のレコードへ
          }

          const data = await response.json();
          newChannelId = data.id;
          newChannelNameResponse = data.name;

          console.log("新規テキストチャンネルを作成しました:", newChannelId, newChannelNameResponse);
        }

        //================================================
        // 3) DynamoDB テーブルに channelId, channelName を追記更新
        //================================================
        {
          const params = {
            TableName: DYNAMODB_QUIZ_TABLE_NAME,
            Key: {
              // テーブルのPKが "Id" (S) の想定
              Id: { S: forumChannelId },
              Timestamp: { S: Timestamp }

            },
            UpdateExpression: "SET channelId = :cId, channelName = :cName, quizId = :qId",
            ExpressionAttributeValues: {
              ":cId":  { S: newChannelId },
              ":cName": { S: newChannelNameResponse },
              ":qId": { S: newMessageId }
            }
          };

          await dynamoClient.send(new UpdateItemCommand(params));
          console.log("DynamoDB テーブルを更新しました (channelId, channelName)。");
        }

        //================================================
        // 4) ログチャンネルへメッセージ送信
        //================================================
        {
          const logContent = `フォーラムチャンネル「${quizTitle}」に問題を投稿しました。新規チャンネル「${newChannelNameResponse}」も作成しました (ID: ${newChannelId})`;
          await sendLogMessage(logContent, BOT_LOG_CHANNEL_ID);
          console.log("ログチャンネルにメッセージを送信しました。");
        }

      } catch (error) {
        console.error("処理中にエラーが発生しました:", error);
      }
    }
  }

  return {
    statusCode: 200,
    body: "DynamoDB ストリームイベントを処理しました。"
  };
};

//================================================
// ログ用メッセージを Discord チャンネルに送信
//================================================
async function sendLogMessage(message, logChannelId) {
  const url = `${DISCORD_API_BASE}/channels/${logChannelId}/messages`;
  const payload = { content: message };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ログメッセージの送信に失敗:", errorText);
    } else {
      console.log("ログメッセージを送信しました。");
    }
  } catch (error) {
    console.error("ログメッセージ送信中にエラー:", error);
  }
}
