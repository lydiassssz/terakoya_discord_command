import fetch from "node-fetch";
import dotenv from "dotenv";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN; // Botトークン
const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID; // ログ出力先チャンネルID
const HAKOBUNE_CATEGORY_ID = process.env.HAKOBUNE_CATEGOLY_ID; // カテゴリID
const GUILD_ID = process.env.GUILD_ID; // DiscordサーバーID
const DYNAMO_TABLE_NAME = process.env.DYNAMO_TABLE_NAME; // DynamoDBテーブル名

// DynamoDBクライアント初期化
const dynamoClient = new DynamoDBClient({ region: "ap-northeast-1" });

export const handler = async (event) => {
  console.log("DynamoDB ストリームイベントを受信:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    if (record.eventName === "INSERT") {
      const newItem = record.dynamodb.NewImage;

      const track = newItem?.Track?.S || "";
      const name = newItem?.Name?.S || "";

      if (track === "new") {
        console.log(`新しいデータを処理中: track: "new", name: ${name}`);

        // Discord上に新しいフォーラムチャンネルを作成
        const channelId = await createForumChannel(name);

        if (channelId) {
          console.log(`作成したチャンネルID: ${channelId}`);

          // DynamoDBのTrackをチャンネルIDに更新
          await updateTrackWithChannelId(newItem, channelId);

          // ログメッセージ送信
          await sendLogMessage(
            `フォーラムチャンネル「${name}」が作成されました。Trackが更新されました（${channelId}）。`,
            BOT_LOG_CHANNEL_ID
          );
        }
      }
    }
  }

  return { statusCode: 200, body: "DynamoDB ストリームイベントを処理しました。" };
};

// Discord上にフォーラムチャンネルを作成する関数
async function createForumChannel(channelName) {
  const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/channels`;

  const payload = {
    name: channelName,
    type: 15, // 15: フォーラムチャンネル
    parent_id: HAKOBUNE_CATEGORY_ID,
    permission_overwrites: [],
  };

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
      console.error("チャンネル作成に失敗:", errorText);
      return null;
    }

    const data = await response.json();
    return data.id; // 作成したチャンネルのIDを返す
  } catch (error) {
    console.error("チャンネル作成中にエラー:", error);
    return null;
  }
}

// DynamoDBのTrackをチャンネルIDに更新する関数
async function updateTrackWithChannelId(item, channelId) {
  const params = {
    TableName: DYNAMO_TABLE_NAME,
    Key: {
      Track: { S: item.Track.S }, // キー条件（Track）
    },
    UpdateExpression: "SET Track = :channelId",
    ExpressionAttributeValues: {
      ":channelId": { S: channelId }, // 新しいTrackの値
    },
  };

  try {
    const command = new UpdateItemCommand(params);
    await dynamoClient.send(command);
    console.log(`DynamoDBのTrackをチャンネルID(${channelId})に更新しました。`);
  } catch (error) {
    console.error("DynamoDBの更新中にエラー:", error);
  }
}

// Discordのログチャンネルにメッセージを送信する関数
async function sendLogMessage(message, logChannelId) {
  const url = `https://discord.com/api/v10/channels/${logChannelId}/messages`;

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
