// makeQuiz.mjs
import { respondJSON, sendLogMessage, getForumChannelsInCategory } from "../utils.mjs";
import dotenv from "dotenv";
dotenv.config();

// ▼ DynamoDB 用の依存モジュールを追加


export async function handleMakeQuizCommand(body, botToken, logChannelId) {
  
  // テーブル名を宣言してクエリを実行
  const TableName = process.env.DYNAMODB_TABLE_NAME
  const forumChannels = await getForumChannelsInCategory(TableName);

  // フォーラムチャンネルが取得できなかった場合のエラー処理
  if (!forumChannels || forumChannels.length === 0) {
    return respondJSON({
      type: 4,
      data: {
        content: "選択できるフォーラムチャンネルがありませんでした。",
        flags: 64, // エフェメラル
      },
    });
  }

  // セレクトメニュー用の options を作成
  // ※ 25件までの制限に注意
  const selectOptions = forumChannels.slice(0, 25).map((ch) => ({
    label: ch.name,
    value: ch.id
  }));

  // セレクトメニューを定義
  const selectMenu = {
    type: 3, // Message Component Type: SELECT_MENU (StringSelect)
    custom_id: "quizSelectMenu", // 次のインタラクションで判別するID
    options: selectOptions,
    placeholder: "投稿するフォーラムチャンネルを選択",
    min_values: 1,
    max_values: 1,
  };


  await sendLogMessage(body, botToken, logChannelId);

  // エフェメラルメッセージとして返信
  return respondJSON({
    type: 4,
    data: {
      content: "クイズを投稿するフォーラムチャンネルを選んでください。",
      components: [
        {
          type: 1, // ActionRow
          components: [selectMenu],
        },
      ],
      flags: 64, // エフェメラル
    },
  });
}


