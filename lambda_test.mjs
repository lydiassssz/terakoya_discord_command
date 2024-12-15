import nacl from "tweetnacl";
import dotenv from "dotenv";
dotenv.config();

export const handler = async (event) => {
    const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

    const signature = event.headers["x-signature-ed25519"];
    const timestamp = event.headers["x-signature-timestamp"];
    const rawBody = event.body;

    console.log("Signature:", signature);
    console.log("Timestamp:", timestamp);
    console.log("Raw Body:", rawBody);

    // リクエスト署名の検証
    if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
        return { statusCode: 401, body: "Invalid request signature" };
    }

    const body = JSON.parse(rawBody);

    // PINGリクエストの処理
    if (body.type === 1) {
        return respondJSON({ type: 1 });
    }

    // スラッシュコマンドの処理
    if (body.type === 2) {
        const commandName = body.data.name;

        if (commandName === "hello") {
            // helloコマンドの応答
            return respondJSON({
                type: 4, // チャネルに即座にメッセージを返す
                data: {
                    content: "hello"
                }
            });
        }

        // 未対応のコマンドの場合
        return respondJSON({
            type: 4,
            data: {
                content: "Command not recognized"
            }
        });
    }

    return { statusCode: 404, body: "Not found" };
};

// リクエスト署名の検証関数
function verifyRequest(rawBody, signature, timestamp, publicKey) {
    if (!rawBody || !signature || !timestamp || !publicKey) {
        console.error("Missing parameters in verifyRequest");
        console.error("rawBody:", rawBody);
        console.error("signature:", signature);
        console.error("timestamp:", timestamp);
        console.error("publicKey:", publicKey);
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
