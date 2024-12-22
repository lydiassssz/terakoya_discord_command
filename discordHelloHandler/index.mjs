import AWS from "aws-sdk";
import nacl from "tweetnacl";
import dotenv from "dotenv";
dotenv.config();

const VIEW_CHANNEL = 1 << 10; // チャンネル閲覧権限 (1024)

// Lambdaクライアントの初期化（未使用であれば削除可能）
const lambda = new AWS.Lambda({ region: "ap-northeast-1" });

export const handler = async (event) => {
  const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const signature = event.headers["x-signature-ed25519"];
  const timestamp = event.headers["x-signature-timestamp"];
  const rawBody = event.body;

  // リクエスト署名検証
  if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
    return { statusCode: 401, body: "無効なリクエスト署名です" };
  }

  const body = JSON.parse(rawBody);

  // Discord相互認証(PING)
  if (body.type === 1) {
    // PING
    return respondJSON({ type: 1 });
  }

  // スラッシュコマンド
  if (body.type === 2) {
    return await handleSlashCommand(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
  }

  // ボタンなどのコンポーネント押下イベント
  if (body.type === 3) {
    return await handleComponentInteraction(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
  }

  return { statusCode: 404, body: "未対応のリクエストです" };
};

// ==================================================================
// スラッシュコマンドの振り分け
// ==================================================================
async function handleSlashCommand(body, botToken, logChannelId) {
  const commandName = body.data.name;

  switch (commandName) {
    case "hello":
      // 例: helloコマンド
      return await handleHelloCommand(body, botToken, logChannelId);

    case "subject_make":
      // 例: subject_makeコマンド
      return await handleSubjectMakeCommand(body, botToken, logChannelId);

    case "remove_access":
      // 過去の実装を参考に拡張した remove_access
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

// ==================================================================
// helloコマンドの例 (エフェメラル対応)
// ==================================================================
async function handleHelloCommand(body, botToken, logChannelId) {
  const user = body.member?.user || body.user;
  const username = user?.username || "不明なユーザー";

  await sendLogMessage(body, botToken, logChannelId);

  // type=4 + flags=64 => 実行者だけが見えるエフェメラルメッセージ
  return respondJSON({
    type: 4,
    data: {
      content: `こんにちは、${username}さん！`,
      flags: 64, // エフェメラル
    },
  });
}

// ==================================================================
// subject_makeコマンドの例 (DynamoDB書き込み + ログ送信)
// ==================================================================
async function handleSubjectMakeCommand(body, botToken, logChannelId) {
  const name = body.data.options?.find((opt) => opt.name === "name")?.value;
  if (!name) {
    return respondJSON({
      type: 4,
      data: { content: "名前が指定されていません。" },
    });
  }

  // Lambda呼び出し例 (不要であれば削除)
  const payload = {
    table: "sub",
    track: "new",
    name,
  };

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

// ==================================================================
// remove_accessコマンド
// ==================================================================
async function handleRemoveAccessCommand(body, botToken, logChannelId) {
  const channelId = body.channel_id;          // 実行されたチャンネルID
  const userId = body.member?.user?.id;       // コマンド実行者のユーザーID

  // 1) チャンネルの情報を取得(カテゴリー名やチャンネル名)
  const channelInfo = await getChannelInfo(channelId, botToken);
  if (!channelInfo) {
    console.error("チャンネル情報の取得に失敗");
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

  // 2) チャンネル権限の剥奪
  const success = await modifyUserChannelPermission(channelId, userId, botToken, {
    allow: 0,
    deny: VIEW_CHANNEL,
  });

  // 3) コマンド実行ログ(ログチャンネル)
  await sendLogMessage(body, botToken, logChannelId);

  if (!success) {
    // 権限変更失敗をエフェメラルで通知
    return respondJSON({
      type: 4,
      data: {
        content: "権限の剥奪に失敗しました。Botの権限を確認してください。",
        flags: 64,
      },
    });
  }

  // 4) 実行者へのDM送信 (復元ボタン付き)
  const dmChannelId = await createDM(userId, botToken);
  if (dmChannelId) {
    const customId = `revert_access-${channelId}-${userId}`;
    await sendDM(
      dmChannelId,
      `権限が剥奪されました: **${formattedChannel}**\n「復元」ボタンを押すと閲覧権限を元に戻せます。`,
      customId,
      botToken
    );
  } else {
    console.error("DMチャンネルの作成に失敗");
  }

  // 5) エフェメラルメッセージで完了報告
  return respondJSON({
    type: 4,
    data: {
      content: `${formattedChannel} の閲覧権限を剥奪しました。DMを確認してください。`,
      flags: 64, // エフェメラル
    },
  });
}

// ==================================================================
// ボタン(コンポーネント)押下時の処理 (type=3)
// ==================================================================
async function handleComponentInteraction(body, botToken, logChannelId) {
  const customId = body.data?.custom_id || "";

  // もし "revert_access-" で始まっていれば閲覧権限を復元する
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

  // ボタンインタラクションには "type:6" でACKを返す (応答不要の場合)
  return respondJSON({ type: 6 });
}

// ==================================================================
// チャンネル情報を取得(カテゴリー名を含む)
// ==================================================================
async function getChannelInfo(channelId, botToken) {
  const url = `https://discord.com/api/v10/channels/${channelId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bot ${botToken}`,
    },
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
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });

  if (!res.ok) {
    console.error("親カテゴリ情報の取得に失敗:", await res.text());
    return "不明なカテゴリ";
  }

  const parentData = await res.json();
  return parentData.name || "不明なカテゴリ";
}

// ==================================================================
// チャンネル権限を変更する関数
// ==================================================================
async function modifyUserChannelPermission(channelId, userId, botToken, { allow, deny }) {
  const url = `https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`;
  const payload = {
    type: 1, // メンバータイプ
    allow: allow.toString(), // number => string
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

// ==================================================================
// DMチャンネルを作成
// ==================================================================
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
  return json.id; // DMチャンネルのID
}

// ==================================================================
// DMへメッセージを送信 (必要ならボタン付き)
// ==================================================================
async function sendDM(channelId, message, customId, botToken) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  let bodyData = { content: message };

  // カスタムID(復元ボタン)が指定されている場合
  if (customId) {
    bodyData.components = [
      {
        type: 1, // アクション行
        components: [
          {
            type: 2,        // ボタン
            style: 1,       // PRIMARYスタイル
            label: "復元",  // ボタンのラベル
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

// ==================================================================
// ログ用メッセージ送信
// ==================================================================
async function sendLogMessage(body, botToken, channelId) {
  const user = body.member?.user || body.user;
  const username = user?.username || "不明なユーザー";
  const discriminator = user?.discriminator || "0000";
  const commandName = body.data.name;

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

// ==================================================================
// 署名検証
// ==================================================================
function verifyRequest(rawBody, signature, timestamp, publicKey) {
  const message = Buffer.from(timestamp + rawBody);
  const sig = Buffer.from(signature, "hex");
  const key = Buffer.from(publicKey, "hex");
  return nacl.sign.detached.verify(message, sig, key);
}

// ==================================================================
// JSONレスポンスを生成
// ==================================================================
function respondJSON(jsonBody) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonBody),
  };
}
