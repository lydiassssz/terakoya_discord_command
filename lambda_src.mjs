import nacl from "tweetnacl";
import dotenv from "dotenv";
dotenv.config();

const VIEW_CHANNEL = 1 << 10; // VIEW_CHANNEL (1024)

export const handler = async (event) => {
    const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
    const BOT_LOG_CHANNEL_ID = process.env.BOT_LOG_CHANNEL_ID;

    const signature = event.headers["x-signature-ed25519"];
    const timestamp = event.headers["x-signature-timestamp"];
    const rawBody = event.body;

    if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
        return { statusCode: 401, body: "Invalid request signature" };
    }

    const body = JSON.parse(rawBody);

    // PING
    if (body.type === 1) {
        return respondJSON({ type: 1 });
    }

    if (body.type === 2) {
        // Slash Command
        const commandName = body.data.name;
        
        // まずデファー（処理中）レスポンスをすぐ返す（3秒以内）
        // type:5 = "Deferred Channel Message with Source"
        const deferredResponse = respondJSON({ type: 5 });
        
        // 非同期処理をここから行う
        (async () => {
            if (commandName === "hello") {
                // ログ送信
                await sendLogMessage(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
                // Follow-upメッセージで結果通知
                await followUpMessage(body, DISCORD_BOT_TOKEN, "hello");
            } else if (commandName === "remove_access") {
                const channelId = body.channel_id;
                const userId = body.member?.user?.id;

                // 権限剥奪
                const success = await modifyUserChannelPermission(channelId, userId, DISCORD_BOT_TOKEN, { allow: 0, deny: VIEW_CHANNEL });
                // ログ送信
                await sendLogMessage(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);

                if (!success) {
                    // 失敗したらfollow-upでエラーメッセージ
                    await followUpMessage(body, DISCORD_BOT_TOKEN, "Failed to remove access. Check bot permissions.");
                    return;
                }

                // DM送信
                const dmChannelId = await createDM(userId, DISCORD_BOT_TOKEN);
                if (dmChannelId) {
                    const customId = `revert_access-${channelId}-${userId}`;
                    await sendDM(dmChannelId, "Your access to the channel was removed. Click 'Revert' to restore it.", customId, DISCORD_BOT_TOKEN);
                } else {
                    console.error("Failed to create DM channel.");
                }

                // Follow-upメッセージで完了報告
                await followUpMessage(body, DISCORD_BOT_TOKEN, "Your access to this channel has been removed. Check your DMs for a revert option.");
            } else {
                // 未対応コマンド
                await sendLogMessage(body, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);
                await followUpMessage(body, DISCORD_BOT_TOKEN, "Command not recognized");
            }
        })();

        // ここで即座にDeferred応答を返して3秒超過を防ぐ
        return deferredResponse;
    }

    if (body.type === 3) {
        // ボタン押下などのComponent Interaction
        const customId = body.data.custom_id;

        // まず type:6でACKを返し、処理中断を避ける（表示変更なし）
        const ackResponse = respondJSON({ type: 6 });

        (async () => {
            if (customId.startsWith("revert_access-")) {
                const [_, channelId, userId] = customId.split("-");

                // 権限復元
                const revertSuccess = await modifyUserChannelPermission(channelId, userId, DISCORD_BOT_TOKEN, { allow: 0, deny: 0 });
                // ログ送信（revert_access実行としてログ）
                const revertBody = {
                    member: body.member,
                    user: body.user,
                    data: { name: "revert_access", options: [] }
                };
                await sendLogMessage(revertBody, DISCORD_BOT_TOKEN, BOT_LOG_CHANNEL_ID);

                // DMで結果通知
                const dmChannelId = await createDM(userId, DISCORD_BOT_TOKEN);
                if (dmChannelId) {
                    if (!revertSuccess) {
                        await sendDM(dmChannelId, "Failed to revert access. Check bot permissions.", null, DISCORD_BOT_TOKEN);
                    } else {
                        await sendDM(dmChannelId, "Your access has been restored.", null, DISCORD_BOT_TOKEN);
                    }
                }
            } else {
                // 未対応コンポーネント: 現状特に何もしない
            }
        })();

        return ackResponse;
    }

    return { statusCode: 404, body: "Not found" };
};

function verifyRequest(rawBody, signature, timestamp, publicKey) {
    const message = Buffer.from(timestamp + rawBody);
    const sig = Buffer.from(signature, "hex");
    const key = Buffer.from(publicKey, "hex");
    return nacl.sign.detached.verify(message, sig, key);
}

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
        console.error("Failed to send follow-up message:", await res.text());
    }
}

async function sendLogMessage(body, botToken, channelId) {
    const user = body.member?.user || body.user;
    const username = user?.username || "UnknownUser";
    const discriminator = user?.discriminator || "0000";

    const commandName = body.data.name;
    let paramsStr = "none";
    if (body.data.options && body.data.options.length > 0) {
        paramsStr = body.data.options.map(opt => `${opt.name}:${opt.value}`).join(", ");
    }

    const logMessage = `**Command Used**\nUser: \`${username}#${discriminator}\`\nCommand: \`/${commandName}\`\nParameters: \`${paramsStr}\``;

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

async function modifyUserChannelPermission(channelId, userId, botToken, { allow, deny }) {
    const url = `https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`;
    const payload = {
        type: 1, // member
        allow: allow.toString(),
        deny: deny.toString()
    };

    const res = await fetch(url, {
        method: "PUT",
        headers: {
            "Authorization": `Bot ${botToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        console.error("Failed to modify permissions:", await res.text());
        return false;
    }
    return true;
}

async function createDM(userId, botToken) {
    const url = 'https://discord.com/api/v10/users/@me/channels';
    const payload = { recipient_id: userId };
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            "Authorization": `Bot ${botToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        console.error("Failed to create DM channel:", await res.text());
        return null;
    }

    const json = await res.json();
    return json.id;
}

async function sendDM(channelId, message, customId, botToken) {
    const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
    let bodyData = { content: message };

    if (customId) {
        bodyData.components = [
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 1,
                        label: "Revert",
                        custom_id: customId
                    }
                ]
            }
        ];
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            "Authorization": `Bot ${botToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(bodyData)
    });

    if (!res.ok) {
        console.error("Failed to send DM message:", await res.text());
    }
}
