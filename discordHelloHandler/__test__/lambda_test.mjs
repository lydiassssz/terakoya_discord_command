import nacl from "tweetnacl";
import dotenv from "dotenv";
dotenv.config();

export const handler = async (event) => {
    const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

    const signature = event.headers["x-signature-ed25519"];
    const timestamp = event.headers["x-signature-timestamp"];
    const rawBody = event.body;

    // リクエスト署名の検証
    if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
        return { statusCode: 401, body: "Invalid request signature" };
    }

    const body = JSON.parse(rawBody);

    // リクエストの種類による処理
    if (body.type === 1) {
        return respondJSON({ type: 1 }); // PINGリクエストの応答
    }

    if (body.type === 2) {
        return handleCommand(body); // スラッシュコマンドの処理
    }

    return { statusCode: 404, body: "Not found" }; // 未対応のリクエスト
};

// スラッシュコマンドの処理関数
function handleCommand(body) {
    const commandName = body.data.name;

    // コマンドごとの処理を分岐
    switch (commandName) {
        case "hello":
            return handleHelloCommand();
        default:
            return respondJSON({
                type: 4,
                data: {
                    content: "Command not recognized"
                }
            });
    }
}

// helloコマンドの処理
function handleHelloCommand() {
    return respondJSON({
        type: 4, // 即座にメッセージを返す
        data: {
            content: "hello"
        }
    });
}

// リクエスト署名の検証関数
function verifyRequest(rawBody, signature, timestamp, publicKey) {
    if (!rawBody || !signature || !timestamp || !publicKey) {
        return false;
    }

    const message = Buffer.from(timestamp + rawBody);
    const sig = Buffer.from(signature, "hex");
    const key = Buffer.from(publicKey, "hex");
    return nacl.sign.detached.verify(message, sig, key);
}

// JSON形式のレスポンスを生成
function respondJSON(jsonBody) {
    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonBody)
    };
}
