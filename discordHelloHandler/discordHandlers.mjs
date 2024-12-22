import fetch from "node-fetch";
import AWS from "aws-sdk";
import nacl from "tweetnacl";

// チャンネル閲覧権限 (1024)
const VIEW_CHANNEL = 1 << 10;

// DynamoDB操作などに使う Lambda クライアント
const lambda = new AWS.Lambda({ region: "ap-northeast-1" });

// -------------------------------------------------------
// スラッシュコマンドを振り分ける関数
// -------------------------------------------------------
export async function handleSlashCommand(body, botToken, logChannelId) {
  const commandName = body.data.name;

  switch (commandName) {
    case "hello":
      return await handleHelloCommand(body, botToken, logChannelId);

    case "subject_make":
      return await handleSubjectMakeCommand(body, botToken, logChannelId);

    case "remove_access":
      return await handleRemoveAccessCommand(body, botToken, logChannelId);

    default:
      // 未対応コマンドはログに送ってからユーザーへ通知
      await sendLogMessage(body, botToken, logChannelId);
      return respondJSON({
        type: 4,
        data: { content: "未対応のコマンドです" },
      });
  }
}

// -------------------------------------------------------
// コンポーネント押下イベント (type=3)
// -------------------------------------------------------
export async function handleComponentInteraction(body, botToken, logChannelId) {
  const customId = body.data?.custom_id || "";

  // "revert_access-" で始まっていれば閲覧権限を復元する
  if (customId.startsWith("revert_access-")) {
    const [_, channelId, userId] = customId.split("-");
    const success = await modifyUserChannelPermission(channelId, userId, botToken, {
      allow: 0,
      deny: 0, // VIEW_CHANNEL をdenyしない => 復元
    });

    // 復元のログ送信
    await sendLogMessage(body, botToken, logChannelId);

    // DMで結果通知
    const dmChannelId = await createDM(userId, botToken);
    if (dmChannelId) {
      const message = success
        ? "権限が復元されました。再度チャンネルを閲覧できるはずです。"
        : "権限の復元に失敗しました。Botの権限を確認してください。";
      await sendDM(dmChannelId, message, null, botToken);
    }
  }

  // ボタンインタラクションには "type:6" でACKを返す
  return respondJSON({ type: 6 });
}

// -------------------------------------------------------
// helloコマンド (例)
// -------------------------------------------------------
async function handleHelloCommand(body, botToken, logChannelId) {
  const user = body.member?.user || body.user;
  const username = user?.username || "不明なユーザー";

  await sendLogMessage(body, botToken, logChannelId);

  return respondJSON({
    type: 4,
    data: {
      content: `こんにちは、${username}さん！`,
      flags: 64, // エフェメラル
    },
  });
}

// -------------------------------------------------------
// subject_makeコマンド (例: DynamoDB書き込み)
// -------------------------------------------------------
async function handleSubjectMakeCommand(body, botToken, logChannelId) {
  const name = body.data.options?.find((opt) => opt.name === "name")?.value;
  if (!name) {
    return respondJSON({
      type: 4,
      data: { content: "名前が指定されていません。" },
    });
  }

  // Lambda呼び出し
  const payload = { table: "sub", track: "new", name };

  try {
    await lambda
      .invoke({
        FunctionName: "arn:aws:lambda:ap-northeast-1:021891619750:function:Terakoya_DynamoDB_Write",
        InvocationType: "Event", // 非同期呼び出し
        Payload: JSON.stringify(payload),
      })
      .promise();

    await sendLogMessage(body, botToken, logChannelId);

    return respondJSON({
      type: 4,
      data: {
        content: `subjectテーブルに「${name}」が登録されました。`,
      },
    });
  } catch (error) {
    console.error("Lambda呼び出しエラー:", error);
    return respondJSON({
      type: 4,
      data: { content: "データ登録中にエラーが発生しました。" },
    });
  }
}

// -------------------------------------------------------
// remove_accessコマンド
// -------------------------------------------------------
async function handleRemoveAccessCommand(body, botToken, logChannelId) {
  const channelId = body.channel_id;
  const userId = body.member?.user?.id;

  // 1) チャンネル情報を取得
  const channelInfo = await getChannelInfo(channelId, botToken);
  if (!channelInfo) {
    return respondJSON({
      type: 4,
      data: {
        content: "チャンネル情報を取得できなかったため、処理を中断しました。",
        flags: 64, // エフェメラル
      },
    });
  }
  const categoryName = channelInfo.parent_name || "未分類";
  const channelName = channelInfo.name || "不明なチャンネル";
  const formattedChannel = `${categoryName}:${channelName}`;

  // 2) 権限の剥奪 (VIEW_CHANNEL をdeny)
  const success = await modifyUserChannelPermission(channelId, userId, botToken, {
    allow: 0,
    deny: VIEW_CHANNEL,
  });

  // 3) コマンド実行ログ
  await sendLogMessage(body, botToken, logChannelId);

  if (!success) {
    // 失敗をエフェメラルで通知
    return respondJSON({
      type: 4,
      data: {
        content: "権限の剥奪に失敗しました。Botの権限を確認してください。",
        flags: 64,
      },
    });
  }

  // 4) DM送信 (復元ボタン付き)
  const dmChannelId = await createDM(userId, botToken);
  if (dmChannelId) {
    const customId = `revert_access-${channelId}-${userId}`;
    await sendDM(
      dmChannelId,
      `権限が剥奪されました: **${formattedChannel}**\n「復元」ボタンを押すと閲覧権限を元に戻せます。`,
      customId,
      botToken
    );
  }

  // 5) エフェメラルメッセージで完了報告
  return respondJSON({
    type: 4,
    data: {
      content: `${formattedChannel} の閲覧権限を剥奪しました。DMを確認してください。`,
      flags: 64,
    },
  });
}

// -------------------------------------------------------
// チャンネル情報を取得 (カテゴリ名含む)
// -------------------------------------------------------
async function getChannelInfo(channelId, botToken) {
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

// -------------------------------------------------------
// 権限を変更する (PUT /channels/{channelId}/permissions/{userId})
// -------------------------------------------------------
async function modifyUserChannelPermission(channelId, userId, botToken, { allow, deny }) {
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

// -------------------------------------------------------
// DMチャンネル作成 (POST /users/@me/channels)
// -------------------------------------------------------
async function createDM(userId, botToken) {
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

// -------------------------------------------------------
// DM送信 (必要に応じてボタン付き)
// -------------------------------------------------------
async function sendDM(channelId, message, customId, botToken) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  const bodyData = { content: message };

  // ボタン付き
  if (customId) {
    bodyData.components = [
      {
        type: 1, // アクション行
        components: [
          {
            type: 2,
            style: 1,       // PRIMARY
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

// -------------------------------------------------------
// ログ送信
// -------------------------------------------------------
async function sendLogMessage(body, botToken, channelId) {
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

// -------------------------------------------------------
// 署名検証
// -------------------------------------------------------
export function verifyRequest(rawBody, signature, timestamp, publicKey) {
  const message = Buffer.from(timestamp + rawBody);
  const sig = Buffer.from(signature, "hex");
  const key = Buffer.from(publicKey, "hex");
  return nacl.sign.detached.verify(message, sig, key);
}

// -------------------------------------------------------
// JSONレスポンスを返すユーティリティ
// -------------------------------------------------------
export function respondJSON(jsonBody) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonBody),
  };
}
