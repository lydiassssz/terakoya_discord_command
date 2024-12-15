import express from "express";
import { handler } from "./index.mjs"; // Lambda関数をインポート

const app = express();
const PORT = 3000;

// Discordが署名検証で必要とする「生のボディ」を取得
app.use("/interactions", express.raw({ type: "*/*" }));

// GETリクエスト対応: 動作確認用
app.get("/interactions", (req, res) => {
    res.status(200).send("Server is running and GET /interactions is working.");
});

// POSTリクエスト対応: Discordのインタラクション
app.post("/interactions", async (req, res) => {
    try {
        console.log("Headers:", req.headers); // デバッグ用
        console.log("Raw Body (String):", req.body.toString()); // デバッグ用
        console.log("Raw Body (Buffer):", req.body instanceof Buffer);

        const response = await handler({
            headers: req.headers,
            body: req.body.toString() // Buffer → Stringに変換
        });

        res.status(response.statusCode).set(response.headers).send(response.body);
    } catch (error) {
        console.error("Error handling request:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});