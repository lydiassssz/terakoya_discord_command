import fetch from "node-fetch";
import nacl from "tweetnacl";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";


// -------------------------------------------------
// 定数
// -------------------------------------------------
export const VIEW_CHANNEL = 1 << 10; // 1024

// -------------------------------------------------
// JSONレスポンスを返す (Discord用のインタラクション応答)
// -------------------------------------------------
export function respondJSON(jsonBody) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonBody),
  };
}

// -------------------------------------------------
// 署名検証
// -------------------------------------------------
export function verifyRequest(rawBody, signature, timestamp, publicKey) {
  const message = Buffer.from(timestamp + rawBody);
  const sig = Buffer.from(signature, "hex");
  const key = Buffer.from(publicKey, "hex");
  return nacl.sign.detached.verify(message, sig, key);
}

// -------------------------------------------------
// ログ送信
// -------------------------------------------------
export async function sendLogMessage(body, botToken, channelId) {
  const user = body.member?.user || body.user;
  const username = user?.username || "不明なユーザー";
  const discriminator = user?.discriminator || "0000";

  let logMessage = "";

  switch (body.type) {
    case 2: {
      // Slash Command
      const commandName = body.data?.name || "(不明)";
      logMessage = `**スラッシュコマンド実行**\nユーザー: \`${username}#${discriminator}\`\nコマンド: \`/${commandName}\``;
      break;
    }
    case 3: {
      // ボタン or セレクトメニュー
      const customId = body.data?.custom_id || "(不明)";
      let detail = "";
      if (body.data.values) {
        // セレクトメニューの場合
        detail = `\n選択値: ${body.data.values.join(", ")}`;
      }
      logMessage = `**コンポーネント操作**\nユーザー: \`${username}#${discriminator}\`\ncustom_id: \`${customId}\`${detail}`;
      break;
    }
    case 5: {
      // モーダル
      const customId = body.data?.custom_id || "(不明)";
      // モーダルのフィールド取得 (複数のTextInputがある場合を想定)
      const inputValues = body.data.components
        ?.flatMap(row => row.components)
        ?.map(c => `\`${c.custom_id}\`: ${c.value}`)
        .join("\n");
      logMessage = `**モーダル送信**\nユーザー: \`${username}#${discriminator}\`\ncustom_id: \`${customId}\`\n${inputValues}`;
      break;
    }
    default: {
      // その他 (Ping(type=1) など)
      logMessage = `**不明 or 未実装のインタラクション** (type=${body.type})\nユーザー: \`${username}#${discriminator}\``;
      break;
    }
  }

  // ---- 送信 ----
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: logMessage }),
  });
}

// -------------------------------------------------
// チャンネル情報取得
// -------------------------------------------------
export async function getChannelInfo(channelId, botToken) {
  const url = `https://discord.com/api/v10/channels/${channelId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (!res.ok) {
    console.error("チャンネル情報の取得に失敗:", await res.text());
    return null;
  }

  const channelData = await res.json();
  const parentName = channelData.parent_id
    ? await getParentCategoryName(channelData.parent_id, botToken)
    : null;

  return {
    name: channelData.name,
    parent_name: parentName,
  };
}

// 親カテゴリ名を取得
async function getParentCategoryName(parentId, botToken) {
  const url = `https://discord.com/api/v10/channels/${parentId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (!res.ok) {
    console.error("親カテゴリ情報の取得に失敗:", await res.text());
    return "不明なカテゴリ";
  }

  const parentData = await res.json();
  return parentData.name || "不明なカテゴリ";
}

// -------------------------------------------------
// ユーザーのチャンネル権限を変更
// -------------------------------------------------
export async function modifyUserChannelPermission(channelId, userId, botToken, { allow, deny }) {
  const url = `https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`;
  const payload = {
    type: 1, // メンバー
    allow: allow.toString(),
    deny: deny.toString(),
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("権限の変更に失敗:", await res.text());
    return false;
  }
  return true;
}

// -------------------------------------------------
// DMチャンネルを作成 (POST /users/@me/channels)
// -------------------------------------------------
export async function createDM(userId, botToken) {
  const url = "https://discord.com/api/v10/users/@me/channels";
  const payload = { recipient_id: userId };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("DMチャンネルの作成に失敗:", await res.text());
    return null;
  }

  const json = await res.json();
  return json.id;
}

// -------------------------------------------------
// DMへメッセージを送信 (必要ならボタン付き)
// -------------------------------------------------
export async function sendDM(channelId, message, customId, botToken) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  const bodyData = { content: message };

  if (customId) {
    bodyData.components = [
      {
        type: 1, // アクション行
        components: [
          {
            type: 2,       // ボタン
            style: 1,      // PRIMARY
            label: "復元",
            custom_id: customId,
          },
        ],
      },
    ];
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyData),
  });

  if (!res.ok) {
    console.error("DMメッセージの送信に失敗:", await res.text());
  }
}

export async function getForumChannelsInCategory(TableName) {
  // 1) DynamoDB クライアントを生成
  const ddbClient = new DynamoDBClient({});

  // 2) Scan で全件取得 (本番ではなるべく Query で絞り込むか、必要に応じて FilterExpression を使うのが望ましい)
  const params = {
    TableName: TableName,
  };
  const data = await ddbClient.send(new ScanCommand(params));

  // 取得した Items から、フォーラムID (Track) とフォーラム名 (Name) を使ってフォーラムチャンネルリストを構築
const forumChannels = (data.Items || []).map((item) => {
  const forumId = item.Track.S; // フォーラムID
  const forumName = item.Name.S; // フォーラム名

  return {
    id: forumId,
    name: forumName,
  };
});

  return forumChannels;
}