// makeQuiz.mjs
import { respondJSON, sendLogMessage } from "../utils.mjs";

/**
 * 1) スラッシュコマンド '/make_quiz' 実行時
 *  -> チャンネル選択用セレクトメニュー付きエフェメラルメッセージを返す
 */
export async function handleMakeQuizCommand(body, botToken, logChannelId) {
  const channelId = body.channel_id; // コマンドを打ったチャンネル
  const guildId = body.guild_id;

  // カテゴリID(フォーラムが含まれる) - ハードコーディング例
  const TARGET_CATEGORY_ID = "1314494964779978784";

  // -----------------------
  // 1-1) フォーラムチャンネル一覧を取得 (utils.mjs等でREST APIを叩く実装が必要)
  // -----------------------
  // 例: すべてのチャンネルを取得し、フォーラムかつ parent_id === TARGET_CATEGORY_ID を抽出
  //     ここでは「仮の」関数例で置いておきます
  const forumChannels = await getForumChannelsInCategory(guildId, TARGET_CATEGORY_ID, botToken);
  if (!forumChannels || forumChannels.length === 0) {
    return respondJSON({
      type: 4,
      data: {
        content: "選択できるフォーラムチャンネルがありませんでした。",
        flags: 64, // エフェメラル
      },
    });
  }

  // -----------------------
  // 1-2) もしコマンドを打ったチャンネルが該当カテゴリ内のフォーラムなら、それをデフォルト選択
  // -----------------------
  let defaultChannelId = null;
  const found = forumChannels.find((ch) => ch.id === channelId);
  if (found) {
    defaultChannelId = found.id;
  }

  // -----------------------
  // 1-3) セレクトメニュー用の options を作成
  // -----------------------
  // DiscordのSelectMenuで使う { label, value, default? } の配列
  // ※ 25件までの制限に注意
  const selectOptions = forumChannels.slice(0, 25).map((ch) => ({
    label: ch.name,
    value: ch.id,
    default: ch.id === defaultChannelId, // 該当チャンネルならデフォルト選択
  }));

  // -----------------------
  // 1-4) セレクトメニューを定義
  // -----------------------
  const selectMenu = {
    type: 3, // Message Component Type: SELECT_MENU (StringSelect)
    custom_id: "quizSelectMenu", // 次のインタラクションで判別するID
    options: selectOptions,
    placeholder: "投稿するフォーラムチャンネルを選択",
    min_values: 1,
    max_values: 1,
  };


  await sendLogMessage(body, botToken, logChannelId);

  // -----------------------
  // 1-5) エフェメラルメッセージとして返信
  // -----------------------
  // components[] の中に ActionRow(1行) → SelectMenu(要素) を配置する
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

/**
 * 2) セレクトメニュー「quizSelectMenu」が押されたとき
 *  -> モーダルを表示
 */
export async function handleQuizSelectMenu(body, botToken, logChannelId) {
  // 選択されたチャンネルID (1つのみ想定)
  const selectedChannelId = body.data.values?.[0];
  if (!selectedChannelId) {
    // 通常はありえないが、万一データが無い場合
    return respondJSON({
      type: 4,
      data: {
        content: "チャンネルが選択されていません。",
        flags: 64,
      },
    });
  }

  // モーダルを表示するには "type": 9 (MODAL) を返す。
  // モーダルの定義を JSON 形式で組み立てる
  return respondJSON({
    type: 9, // MODAL
    data: {
      custom_id: "makeQuizModal", // 次のモーダル送信時に判別
      title: "クイズ情報入力フォーム",
      components: [
        {
          type: 1, // ActionRow
          components: [
            {
              type: 4, // TextInput
              custom_id: "quizNumber",
              label: "問題番号",
              style: 1, // SHORT (1行)
              min_length: 1,
              max_length: 20,
              placeholder: "例: Q1, 1, 001 など",
              required: true,
            },
          ],
        },
        {
          type: 1, // ActionRow
          components: [
            {
              type: 4, // TextInput
              custom_id: "quizText",
              label: "問題文",
              style: 2, // PARAGRAPH (複数行)
              min_length: 1,
              max_length: 2000,
              placeholder: "ここに問題文を入力",
              required: true,
            },
          ],
        },
        // モーダル内に複数のTextInputを追加する場合は同様に増やす
      ],

      // モーダルを開く段階では、選択されたチャンネルIDをユーザに見せる必要はないが、
      // 後続で受け取るために「埋め込み用の情報」として持たせることはできません。
      // 代わりに以下のようにbody.custom_idを工夫したり、今のインタラクションデータを
      // DBや一時ストレージに保持する方法などが考えられます。
      // → ここでは簡易例として"makeQuizModal|<channelId>"のように繋いでもOK
      //    しかし Discordの公式UIではデフォルトでは渡せないため、
      //    次の処理で body.message.interaction などを参照しつつ管理します。
    },
  });
}

/**
 * 3) モーダル「makeQuizModal」送信時
 *  -> フォーラムチャンネルID (選択メニューのときの選択) + 入力された問題番号＆問題文 を取得して #bot_log に投稿
 */
export async function handleQuizModalSubmit(body, botToken, logChannelId) {
  // 2) でセットした custom_id: "makeQuizModal"
  // テキスト入力値は body.data.components[] から取得する
  const fields = extractModalFields(body.data.components);
  const quizNumber = fields.quizNumber;
  const quizText = fields.quizText;

  // セレクトで選んだチャンネルIDを持っていない場合、
  // body.message.interaction などから情報をたどる必要があるが、
  // Discordのデフォルト挙動ではモーダルに選択結果が持ち越されません。
  // そのため、セレクトメニューの選択直後に一時的にDBに保存する/あるいは
  // custom_id に埋め込んでパースする方法が一般的です。
  // 
  // ここでは「簡易的に '直前の選択結果を保持している'」と仮定して、
  // 変数 selectedChannelId をどうにかして復元したと想定します。
  // 例: "makeQuizModal|selectedChannelId" 形式にしてパースする等。
  // (以下は仮の値)
  const selectedChannelId = "999999999999999999";

  // -----------------------
  // 3-1) #bot_log に投稿する (sendLogMessageを流用)
  // -----------------------
  // sendLogMessage(body, botToken, logChannelId) だけだと「コマンド実行時の情報」を投稿します。
  // 追加で好きなテキストを載せたいなら、utils.mjs側で関数を拡張するか、
  // 別途 “sendBotLog(botToken, channelId, content)” のような関数を用意して呼ぶほうが良いです。
  // 
  // ここでは簡易的に sendLogMessage を呼んだあと、別メッセージを送ることを想定します。

  await sendLogMessage(body, botToken, logChannelId); // コマンド実行の基本ログ

  // さらに "問題情報" を #bot_log に投稿
  const logContent = `**[make_quiz]**\n- 選択チャンネル: <#${selectedChannelId}>\n- 問題番号: ${quizNumber}\n- 問題文:\n${quizText}`;

  // -----------------------
  // 3-2) ユーザーへの返信 (エフェメラル)
  // -----------------------
  return respondJSON({
    type: 4,
    data: {
      content: `クイズ情報を受け付けました。\nチャンネル: <#${selectedChannelId}>\n問題番号: ${quizNumber}`,
      flags: 64, // エフェメラル
    },
  });
}

/* --------------------------------------------------
  以下、補助的な関数例
----------------------------------------------------- */

/**
 * モーダル入力欄の { custom_id: string, value: string } を抽出しやすくする関数
 */
function extractModalFields(components = []) {
  // components: [ ActionRow( { type:1, components:[{ type:4(TextInput), custom_id, value }] } ), ... ]
  const fields = {};
  for (const row of components) {
    if (!row.components) continue;
    for (const comp of row.components) {
      if (comp.type === 4 && comp.custom_id) {
        fields[comp.custom_id] = comp.value || "";
      }
    }
  }
  return fields;
}

/**
 * カテゴリID指定でフォーラムチャンネル一覧を取る(仮実装)
 * 実際には Discord API を叩く or キャッシュを使うなどする
 */
async function getForumChannelsInCategory(guildId, categoryId, botToken) {
  // 例) fetchGuildChannels(guildId, botToken) → すべてのチャンネルを取得
  //     filter(ch => ch.type===15(フォーラム) && ch.parent_id===categoryId)
  // ここでは仮データで例示
  return [
    { id: "999999999999999997", name: "フォーラムA" },
    { id: "999999999999999998", name: "フォーラムB" },
    { id: "999999999999999999", name: "フォーラムC" },
  ];
}