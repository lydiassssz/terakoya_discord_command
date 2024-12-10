import nacl from "tweetnacl";

export const handler = async (event) => {
    const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

    const signature = event.headers["x-signature-ed25519"];
    const timestamp = event.headers["x-signature-timestamp"];
    const rawBody = event.body;

    // 署名検証
    if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
        return {
            statusCode: 401,
            body: "Invalid request signature",
        };
    }

    const body = JSON.parse(rawBody);

    // Pingリクエストへの応答
    if (body.type === 1) {
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: 1 }),
        };
    }

    // スラッシュコマンド実行時
    if (body.type === 2) {
        const commandName = body.data.name;
        
        // `/hello`コマンドに対するレスポンス
        let response;
        if (commandName === "hello") {
            response = {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: 4,
                    data: { content: "hello" },
                }),
            };
        } else {
            // 未対応コマンドの場合適当なレスポンス
            response = {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: 4,
                    data: { content: "Command not recognized" },
                }),
            };
        }
        
        // ログの送信（全てのスラッシュコマンドについてログを出す）
        await sendLogMessage(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);

        return response;
    }

    // 不明なリクエスト
    return {
        statusCode: 404,
        body: "Not found",
    };
};

function verifyRequest(rawBody, signature, timestamp, publicKey) {
    const message = Buffer.from(timestamp + rawBody);
    const sig = Buffer.from(signature, "hex");
    const key = Buffer.from(publicKey, "hex");
    return nacl.sign.detached.verify(message, sig, key);
}

async function sendLogMessage(body, botToken, channelId) {
    // ユーザ情報
    // body.member.user または body.user でユーザー情報を取得可能
    const user = body.member?.user || body.user;
    const username = user?.username || "UnknownUser";
    const discriminator = user?.discriminator || "0000";
    
    // コマンド名・パラメータ取得
    const commandName = body.data.name;
    let paramsStr = "";
    if (body.data.options && body.data.options.length > 0) {
        // オプションを name:value 形式で列挙
        paramsStr = body.data.options.map(opt => `${opt.name}:${opt.value}`).join(", ");
    } else {
        paramsStr = "none";
    }

    const logMessage = `**Command Used**\nUser: \`${username}#${discriminator}\`\nCommand: \`/${commandName}\`\nParameters: \`${paramsStr}\``;

    // Discord API へ POST /channels/{channel.id}/messages
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
        console.error("Failed to send log message:", await response.text());
    }
}
