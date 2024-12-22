import dotenv from "dotenv";
dotenv.config();

import { verifyRequest, respondJSON } from "./utils.js";
import { handlerSlashOrInteraction } from "./discordHandlers.js";

export const handler = async (event) => {
  const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

  const signature = event.headers["x-signature-ed25519"];
  const timestamp = event.headers["x-signature-timestamp"];
  const rawBody = event.body;

  // リクエスト署名検証
  if (!verifyRequest(rawBody, signature, timestamp, DISCORD_PUBLIC_KEY)) {
    return { statusCode: 401, body: "無効なリクエスト署名です" };
  }

  const body = JSON.parse(rawBody);

  // Discord の相互認証 (PING)
  if (body.type === 1) {
    return respondJSON({ type: 1 }); // PONG
  }

  // スラッシュコマンド or ボタン押下イベントなどを共通で扱う関数へ
  return await handlerSlashOrInteraction(body);
};