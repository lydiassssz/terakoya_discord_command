import fetch from "node-fetch";
import nacl from "tweetnacl";

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
  const commandName = body.data?.name || "(不明)";

  const logMessage = `**コマンド実行**\nユーザー: \`${username}#${discriminator}\`\nコマンド: \`/${commandName}\``;

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