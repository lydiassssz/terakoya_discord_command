import nacl from "tweetnacl";
import dotenv from "dotenv";
dotenv.config();

const VIEW_CHANNEL = 1 << 10; // チャンネル閲覧権限 (1024)

export const handler = async (event) => {
    const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY; // Discordの公開鍵
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN; // Botトークン
    const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID; // ログ用チャンネルID

    const signature = event.headers["x-signature-ed25519"]; // リクエスト署名
    const timestamp = event.headers["x-signature-timestamp"]; // リクエストタイムスタンプ
    const rawBody = event.body; // リクエストボディ

    // 署名検証
    if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
        return { statusCode: 401, body: "無効なリクエスト署名です" };
    }

    const body = JSON.parse(rawBody);

    // リクエスト種別に応じた処理
    if (body.type === 1) {
        return respondJSON({ type: 1 }); // PINGリクエストへの応答
    }

    if (body.type === 2) {
        return await handleSlashCommand(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID); // スラッシュコマンドの処理
    }

    if (body.type === 3) {
        return await handleComponentInteraction(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID); // ボタンやコンポーネントの処理
    }

    return { statusCode: 404, body: "未対応のリクエストです" }; // 未対応のリクエスト
};

// スラッシュコマンドの処理
async function handleSlashCommand(body, botToken, logChannelId) {
    const commandName = body.data.name;

    // コマンド名に応じた処理
    switch (commandName) {
        case "hello":
            return await handleHelloCommand(body, botToken, logChannelId); // helloコマンド
        case "remove_access":
            return await handleRemoveAccessCommand(body, botToken, logChannelId); // remove_accessコマンド
        default:
            await sendLogMessage(body, botToken, logChannelId); // 未対応コマンドのログ送信
            return respondJSON({
                type: 4,
                data: { content: "未対応のコマンドです" }
            });
    }
}

// helloコマンドの処理（エフェメラルメッセージ対応）
async function handleHelloCommand(body, botToken, logChannelId) {
    const user = body.member.user;

    // コマンド実行ログの送信
    await sendLogMessage(body, botToken, logChannelId);

    // 実行者にのみ見えるエフェメラルメッセージで応答
    return respondJSON({
        type: 4, // 即時応答
        data: {
            content: `こんにちは、${user.username}さん！`, // メッセージ内容
            flags: 64 // エフェメラルメッセージ（実行者にのみ表示）
        }
    });
}

async function handleRemoveAccessCommand(body, botToken, logChannelId) {
    const channelId = body.channel_id; // チャンネルID
    const userId = body.member?.user?.id; // ユーザーID

    // チャンネル情報の取得
    const channelInfo = await getChannelInfo(channelId, botToken);
    if (!channelInfo) {
        console.error("チャンネル情報の取得に失敗しました");
        await followUpMessage(body, botToken, "チャンネル情報を取得できなかったため、処理を中断しました。", true);
        return;
    }

    const categoryName = channelInfo.parent_name || "未分類"; // カテゴリー名
    const channelName = channelInfo.name || "不明なチャンネル"; // チャンネル名
    const formattedChannel = `${categoryName}:${channelName}`; // フォーマット例: "カテゴリー名:チャンネル名"

    // チャンネル権限の剥奪
    const success = await modifyUserChannelPermission(channelId, userId, botToken, { allow: 0, deny: VIEW_CHANNEL });

    // ログ送信
    await sendLogMessage(body, botToken, logChannelId);

    if (!success) {
        // 権限変更に失敗した場合のエフェメラル応答
        await followUpMessage(body, botToken, "権限の剥奪に失敗しました。Botの権限を確認してください。", true);
        return;
    }

    // ユーザーへのDM送信
    const dmChannelId = await createDM(userId, botToken);
    if (dmChannelId) {
        const customId = `revert_access-${channelId}-${userId}`;
        await sendDM(dmChannelId, `権限が剥奪されました: ${formattedChannel}\n「復元」をクリックして権限を戻すことができます。`, customId, botToken);
    } else {
        console.error("DMチャンネルの作成に失敗しました");
    }

    // 権限剥奪完了をエフェメラルメッセージで通知
    await followUpMessage(body, botToken, `${formattedChannel} の権限を剥奪しました。DMを確認してください。`, true);
}

// チャンネル情報を取得する関数
async function getChannelInfo(channelId, botToken) {
    const url = `https://discord.com/api/v10/channels/${channelId}`; // チャンネル詳細情報エンドポイント
    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Authorization": `Bot ${botToken}` // Botトークンを認証に使用
        }
    });

    if (!res.ok) {
        console.error("チャンネル情報の取得に失敗しました:", await res.text());
        return null;
    }

    const channelData = await res.json(); // チャンネルデータをJSON形式で取得

    return {
        name: channelData.name, // チャンネル名
        parent_name: channelData.parent_id ? await getParentCategoryName(channelData.parent_id, botToken) : null // 親カテゴリ名
    };
}

// カテゴリー名を取得する関数
async function getParentCategoryName(parentId, botToken) {
    const url = `https://discord.com/api/v10/channels/${parentId}`; // 親カテゴリの詳細情報エンドポイント
    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Authorization": `Bot ${botToken}` // Botトークンを認証に使用
        }
    });

    if (!res.ok) {
        console.error("親カテゴリ情報の取得に失敗しました:", await res.text());
        return "不明なカテゴリ";
    }

    const parentData = await res.json();
    return parentData.name || "不明なカテゴリ"; // 親カテゴリ名またはデフォルト
}



// ボタンやコンポーネントのインタラクション処理
async function handleComponentInteraction(body, botToken, logChannelId) {
    const customId = body.data.custom_id;

    // カスタムIDが「revert_access-」で始まる場合
    if (customId.startsWith("revert_access-")) {
        const [_, channelId, userId] = customId.split("-");
        const success = await modifyUserChannelPermission(channelId, userId, botToken, { allow: 0, deny: 0 });

        // 権限復元処理のログ送信
        await sendLogMessage(body, botToken, logChannelId);

        // DMで結果通知
        const dmChannelId = await createDM(userId, botToken);
        if (dmChannelId) {
            const message = success
                ? "権限が復元されました"
                : "権限の復元に失敗しました。Botの権限を確認してください。";
            await sendDM(dmChannelId, message, null, botToken);
        }
    }

    // インタラクションにACK応答
    return respondJSON({ type: 6 });
}

// リクエスト署名の検証
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
        body: JSON.stringify(jsonBody)
    };
}

async function followUpMessage(interaction, botToken, content) {
    const url = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
    const res = await fetch(url, {
        method: "PATCH",
        headers: {
            "Authorization": `Bot ${botToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content })
    });
    if (!res.ok) {
        console.error("Follow-upメッセージの送信に失敗しました:", await res.text());
    }
}

async function sendLogMessage(body, botToken, channelId) {
    const user = body.member?.user || body.user;
    const username = user?.username || "不明なユーザー";
    const discriminator = user?.discriminator || "0000";

    const commandName = body.data.name;
    const logMessage = `**コマンド実行**\nユーザー: \`${username}#${discriminator}\`\nコマンド: \`/${commandName}\``;

    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bot ${botToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: logMessage })
    });

    if (!response.ok) {
        console.error("ログメッセージの送信に失敗しました:", await response.text());
    }
}


// チャンネル権限を変更する関数
async function modifyUserChannelPermission(channelId, userId, botToken, { allow, deny }) {
    const url = `https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`;
    const payload = {
        type: 1, // メンバータイプ
        allow: allow.toString(),
        deny: deny.toString()
    };

    const res = await fetch(url, {
        method: "PUT", // HTTPメソッドはPUT
        headers: {
            "Authorization": `Bot ${botToken}`, // Botトークンを認証に使用
            "Content-Type": "application/json" // JSON形式を指定
        },
        body: JSON.stringify(payload) // ペイロードをJSON文字列に変換
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
    const url = 'https://discord.com/api/v10/users/@me/channels'; // DMチャンネル作成用エンドポイント
    const payload = { recipient_id: userId }; // 受信者のユーザーIDを指定
    const res = await fetch(url, {
        method: 'POST', // HTTPメソッドはPOST
        headers: {
            "Authorization": `Bot ${botToken}`, // Botトークンを認証に使用
            "Content-Type": "application/json" // JSON形式を指定
        },
        body: JSON.stringify(payload) // ペイロードをJSON文字列に変換
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
                        custom_id: customId // ボタンに割り当てるカスタムID
                    }
                ]
            }
        ];
    }

    const res = await fetch(url, {
        method: 'POST', // HTTPメソッドはPOST
        headers: {
            "Authorization": `Bot ${botToken}`, // Botトークンを認証に使用
            "Content-Type": "application/json" // JSON形式を指定
        },
        body: JSON.stringify(bodyData) // ペイロードをJSON文字列に変換
    });

    // リクエスト失敗時のエラーハンドリング
    if (!res.ok) {
        console.error("DMメッセージの送信に失敗しました:", await res.text());
    }
}
