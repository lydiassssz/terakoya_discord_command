import nacl from "tweetnacl";

export const handler = async (event) => {
    const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

    const signature = event.headers["x-signature-ed25519"];
    const timestamp = event.headers["x-signature-timestamp"];
    const rawBody = event.body;

    if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
        return {
            statusCode: 401,
            body: "Invalid request signaturse",
        };
    }

    const body = JSON.parse(rawBody);

    if (body.type === 1) {
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: 1 }),
        };
    } else if (body.type === 2) {
        const commandName = body.data.name;
        if (commandName === "hello") {
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: 4,
                    data: { content: "hello" },
                }),
            };
        }
    }

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
