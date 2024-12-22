import AWS from "aws-sdk";
import nacl from "tweetnacl";
import dotenv from "dotenv";
dotenv.config();

const VIEW_CHANNEL = 1 << 10; // チャンネル閲覧権限 (1024)

// Lambdaクライアントの初期化
const lambda = new AWS.Lambda({ region: "ap-northeast-1" });

export const handler = async (event) => {
  const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

  const signature = event.headers["x-signature-ed25519"];
  const timestamp = event.headers["x-signature-timestamp"];
  const rawBody = event.body;

  if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
    return { statusCode: 401, body: "無効なリクエスト署名です" };
  }

  const body = JSON.parse(rawBody);

  if (body.type === 1) {
    // PING
    return respondJSON({ type: 1 });
  }

  if (body.type === 2) {
    // スラッシュコマンド
    return await handleSlashCommand(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
  }

  return { statusCode: 404, body: "未対応のリクエストです" };
};

// スラッシュコマンドの処理
async function handleSlashCommand(body, botToken, logChannelId) {
  const commandName = body.data.name;

  switch (commandName) {
    case "hello":
      return await handleHelloCommand(body, botToken, logChannelId);

    case "subject_make":
      return await handleSubjectMakeCommand(body, botToken, logChannelId);

    // 復活させた remove_access コマンド
    case "remove_access":
      return await handleRemoveAccessCommand(body, botToken, logChannelId);

    default:
      await sendLogMessage(body, botToken, logChannelId);
      return respondJSON({
        type: 4,
        data: { content: "未対応のコマンドです" },
      });
  }
}

// subject_makeコマンドの処理
async function handleSubjectMakeCommand(body, botToken, logChannelId) {
  const name = body.data.options?.find((opt) => opt.name === "name")?.value;

  if (!name) {
    return respondJSON({
      type: 4,
      data: { content: "名前が指定されていません。" },
    });
  }

  const payload = {
    table: "sub",
    track: "new",
    name: name,
  };

  try {
    // Lambda関数を非同期呼び出し
    await lambda
      .invoke({
        FunctionName:
          "arn:aws:lambda:ap-northeast-1:021891619750:function:Terakoya_DynamoDB_Write",
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

// remove_accessコマンドの処理
async function handleRemoveAccessCommand(body, botToken, logChannelId) {
  // ユーザーオプション（例: /remove_access user: <@12345678>）からユーザーIDを取得
  const userIdOption = body.data.options?.find((opt) => opt.name === "user");
  if (!userIdOption || !userIdOption.value) {
    return respondJSON({
      type: 4,
      data: { content: "ユーザーが指定されていません。" },
    });
  }
  const userId = userIdOption.value;

  // 実行されたチャンネルIDを取得（＝このチャンネルに対して権限を操作）
  const channelId = body.channel_id;

  try {
    // VIEW_CHANNEL のみをdenyにすることで閲覧権限を剥奪
    const success = await modifyUserChannelPermission(channelId, userId, botToken, {
      allow: 0,
      deny: VIEW_CHANNEL,
    });

    // コマンド実行ログを送信（ログチャンネルへの書き込みなど）
    await sendLogMessage(body, botToken, logChannelId);

    if (!success) {
      return respondJSON({
        type: 4,
        data: { content: "権限の変更に失敗しました。" },
      });
    }

    // 正常完了メッセージ
    return respondJSON({
      type: 4,
      data: {
        content: `ユーザー <@${userId}> の閲覧権限を削除しました。`,
      },
    });
  } catch (err) {
    console.error("remove_accessコマンドエラー:", err);
    return respondJSON({
      type: 4,
      data: { content: "権限削除中にエラーが発生しました。" },
    });
  }
}

// 署名検証
function verifyRequest(rawBody, signature, timestamp, publicKey) {
  const message = Buffer.from(timestamp + rawBody);
  const sig = Buffer.from(signature, "hex");
  const key = Buffer.from(publicKey, "hex");
  return nacl.sign.detached.verify(message, sig, key);
}

// JSONレスポンスを生成
function respondJSON(jsonBody) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonBody),
  };
}

// ログ用メッセージ送信
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

// チャンネル権限を変更する関数
async function modifyUserChannelPermission(channelId, userId, botToken, { allow, deny }) {
  const url = `https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`;
  const payload = {
    type: 1, // メンバータイプ
    allow: allow.toString(),
    deny: deny.toString(),
  };

  const res = await fetch(url, {
    method: "PUT", // HTTPメソッドはPUT
    headers: {
      Authorization: `Bot ${botToken}`, // Botトークンを認証に使用
      "Content-Type": "application/json", // JSON形式を指定
    },
    body: JSON.stringify(payload), // ペイロードをJSON文字列に変換
  });

  // リクエスト失敗時のエラーハンドリング
  if (!res.ok) {
    console.error("権限の変更に失敗しました:", await res.text());
    return false;
  }
  return true; // 成功時はtrueを返す
}

// DMチャンネルを作成する関数
async function createDM(userId, botToken) {
  const url = "https://discord.com/api/v10/users/@me/channels"; // DMチャンネル作成用エンドポイント
  const payload = { recipient_id: userId }; // 受信者のユーザーIDを指定
  const res = await fetch(url, {
    method: "POST", // HTTPメソッドはPOST
    headers: {
      Authorization: `Bot ${botToken}`, // Botトークンを認証に使用
      "Content-Type": "application/json", // JSON形式を指定
    },
    body: JSON.stringify(payload), // ペイロードをJSON文字列に変換
  });

  // リクエスト失敗時のエラーハンドリング
  if (!res.ok) {
    console.error("DMチャンネルの作成に失敗しました:", await res.text());
    return null; // 失敗時はnullを返す
  }

  const json = await res.json(); // レスポンスをJSONとして解析
  return json.id; // 作成したDMチャンネルのIDを返す
}

// DMを送信する関数
async function sendDM(channelId, message, customId, botToken) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`; // メッセージ送信用エンドポイント
  let bodyData = { content: message }; // メッセージ内容を指定

  // カスタムIDが指定されている場合、コンポーネントを追加
  if (customId) {
    bodyData.components = [
      {
        type: 1, // コンポーネントのタイプ（アクション行）
        components: [
          {
            type: 2, // ボタンタイプ
            style: 1, // ボタンのスタイル（PRIMARY）
            label: "復元", // ボタンのラベル
            custom_id: customId, // ボタンに割り当てるカスタムID
          },
        ],
      },
    ];
  }

  const res = await fetch(url, {
    method: "POST", // HTTPメソッドはPOST
    headers: {
      Authorization: `Bot ${botToken}`, // Botトークンを認証に使用
      "Content-Type": "application/json", // JSON形式を指定
    },
    body: JSON.stringify(bodyData), // ペイロードをJSON文字列に変換
  });

  // リクエスト失敗時のエラーハンドリング
  if (!res.ok) {
    console.error("DMメッセージの送信に失敗しました:", await res.text());
  }
}