import { respondJSON, checkIfUserAlreadyAnswered, sendLogMessage } from "../utils.mjs";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { CloudWatchLogsClient, PutLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";



/**
 * クイズ回答ボタンを押した際に呼び出される関数。
 * 既に回答したユーザーの場合はエラーメッセージを返し、
 * 未回答の場合はクイズ回答用のモーダルを返す。
 *
 * @param {Object} body - Discordから送られるInteractionのボディ
 * @returns {Object} respondJSONで返すべきレスポンスオブジェクト
 */
export async function handleAnswerQuizButton(body) {
  // DiscordのInteractionボディから必要な情報を取り出す
  const userId = body?.member?.user?.id;
  const messageId = body?.message?.id;


  const alreadyAnswered = await checkIfUserAlreadyAnswered(userId, messageId);
  const logClient = new CloudWatchLogsClient({});
  const logGroupName = "/aws/lambda/discordHelloHandler";
  const logStreamName = "test";

  const logParams = {
    logGroupName,
    logStreamName,
    logEvents: [
      {
        message: JSON.stringify({alreadyAnswered, "code": "handleAnswerQuizButton"}),
        timestamp: Date.now(),
      },
    ],
  };

  await logClient.send(new PutLogEventsCommand(logParams));

  if (alreadyAnswered === true) {
    // 既に回答している場合はエラーメッセージをエフェメラル(本人にしか見えない)で返す
    return respondJSON({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
      content: "既にクイズに回答しています。",
      flags: 64, // エフェメラルメッセージ (本人にしか見えない)
      },
    });
    
  } else {
    // 未回答の場合はモーダルを開く
    // Discordモーダル表示のためのtypeは9 (MODAL)
    // 送信するdataには custom_id, title, components を含める
    return respondJSON({
      type: 9, // MODAL
      data: {
        // 各モーダルを区別するために、messageId等を付与したカスタムIDを持たせる
        custom_id: `quiz_modal_${messageId}`,
        title: "クイズ回答フォーム",
        components: [
          {
            // Action Row
            type: 1,
            components: [
              {
                // Text Input
                type: 4,
                custom_id: "quiz_answer",
                style: 2,
                label: "回答を記入してください",
                required: true,
                min_length: 1,
                max_length: 4000,
                placeholder: "あなたの回答を入力してください。",
              },
            ],
          },
        ],
      },
    });
  }
}
