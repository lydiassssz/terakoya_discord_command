import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;
const HAKOBUNE_CATEGORY_ID = process.env.HAKOBUNE_CATEGOLY_ID;

export const handler = async (event) => {
  console.log("Received DynamoDB Stream event:", JSON.stringify(event, null, 2));

  // レコードごとに処理
  for (const record of event.Records) {
    if (record.eventName === "INSERT") {
      const newItem = record.dynamodb.NewImage;

      // DynamoDBのデータをJSON形式に変換
      const track = newItem?.Track?.S || "";
      const name = newItem?.Name?.S || "";

      // フィルタリング条件: trackが"new"
      if (track === "new") {
        console.log(`Processing new record with track: "new" and name: ${name}`);

        // Discordフォーラムチャンネル作成
        const channelId = await createForumChannel(name);

        // チャンネル作成成功時にログを出力
        if (channelId) {
          await sendLogMessage(`フォーラムチャンネル「${name}」が作成されました。`, BOT_LOG_CHANNEL_ID);
        }
      }
    }
  }

  return { statusCode: 200, body: "Processed DynamoDB Stream records." };
};

// Discordのフォーラムチャンネルを作成する関数
async function createForumChannel(channelName) {
  const url = `https://discord.com/api/v10/guilds/${process.env.GUILD_ID}/channels`;

  const payload = {
    name: channelName,
    type: 15, // 15: フォーラムチャンネル
    parent_id: HAKOBUNE_CATEGORY_ID, // カテゴリーID
    permission_overwrites: [], // カテゴリーの権限設定と同期
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
      console.error("Failed to create channel:", errorText);
      return null;
    }

    const data = await response.json();
    console.log(`Successfully created forum channel with ID: ${data.id}`);
    return data.id; // 作成したチャンネルのIDを返す
  } catch (error) {
    console.error("Error creating forum channel:", error);
    return null;
  }
}

// Discordのログチャンネルにメッセージを送信する関数
async function sendLogMessage(message, logChannelId) {
  const url = `https://discord.com/api/v10/channels/${logChannelId}/messages`;

  const payload = {
    content: message,
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
      console.error("Failed to send log message:", errorText);
    } else {
      console.log("Log message sent successfully.");
    }
  } catch (error) {
    console.error("Error sending log message:", error);
  }
}
