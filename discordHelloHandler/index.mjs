import AWS from "aws-sdk";
import nacl from "tweetnacl";
import dotenv from "dotenv";
dotenv.config();

import {
  handleSlashCommand,
  handleComponentInteraction,
  respondJSON,
  verifyRequest,
} from "./discordHandlers.js";

// -------------------------------------------------------
// Lambdaハンドラ
// -------------------------------------------------------
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

  // Discord相互認証 (PING)
  if (body.type === 1) {
    // type=1 => PING
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

  // 未対応
  return { statusCode: 404, body: "未対応のリクエストです" };
};
