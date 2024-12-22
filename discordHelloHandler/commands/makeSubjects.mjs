import { respondJSON, sendLogMessage } from "../utils.mjs";
import AWS from "aws-sdk";

const lambda = new AWS.Lambda({ region: "ap-northeast-1" });

export async function handleMakeSubjectCommand(body, botToken, logChannelId) {
  const name = body.data.options?.find((opt) => opt.name === "name")?.value;
  if (!name) {
    return respondJSON({
      type: 4,
      data: { content: "名前が指定されていません。" },
    });
  }

  // 例: DynamoDB書き込み用にLambdaを呼ぶ
  const payload = { table: "sub", track: "new", name };

  try {
    await lambda
      .invoke({
        FunctionName: "arn:aws:lambda:ap-northeast-1:021891619750:function:Terakoya_DynamoDB_Write",
        InvocationType: "Event",
        Payload: JSON.stringify(payload),
      })
      .promise();

    await sendLogMessage(body, botToken, logChannelId);

    return respondJSON({
      type: 4,
      data: {
        content: `subjectテーブルに「${name}」が登録されました。`,
      },
    });
  } catch (error) {
    console.error("Lambda呼び出しエラー:", error);
    return respondJSON({
      type: 4,
      data: { content: "データ登録中にエラーが発生しました。" },
    });
  }
}
