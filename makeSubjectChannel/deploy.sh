#!/bin/bash
#
# deploy.sh
#   1. 対象フォルダをZIP圧縮
#   2. S3にアップロード
#   3. Lambdaを更新
#   4. ZIPファイル削除
#   5. 終了時に clear + 日時ログ表示
#

############################
# 設定値
############################

# ディレクトリ名（Lambda関数名やファイル名に流用）
DIR_NAME=$(basename "$(pwd)")

# Lambda関数名 (arn ではなく関数名)
FUNCTION_NAME="$DIR_NAME"

# S3バケット名 (zipをアップロードする先)
S3_BUCKET="terakoyalambda"

# S3内のオブジェクトキー (パス) → ディレクトリ名を使う
S3_KEY="${DIR_NAME}.zip"

# ZIPファイルの出力先 → ディレクトリ名を使う
ZIP_FILE="${DIR_NAME}.zip"

############################
# 1. ZIP圧縮
############################
echo "=== Zipping source code ==="
zip -r "$ZIP_FILE" . \
    -x ".git/*" \
    -x ".DS_Store" \
    -x "deploy*.sh" \
    -x "__test__/*" \

if [ $? -ne 0 ]; then
  echo "[ERROR] zipコマンドに失敗しました。"
  exit 1
fi

############################
# 2. S3へアップロード
############################
echo "=== Uploading ${ZIP_FILE} to s3://${S3_BUCKET}/${S3_KEY} ==="
aws s3 cp "$ZIP_FILE" "s3://${S3_BUCKET}/${S3_KEY}" --no-cli-pager
if [ $? -ne 0 ]; then
  echo "[ERROR] S3へのアップロードに失敗しました。"
  exit 1
fi

############################
# 3. アップロード成功後: ZIPファイル削除
############################
echo "=== Removing local ZIP file: ${ZIP_FILE} ==="
rm -f "$ZIP_FILE"
if [ $? -ne 0 ]; then
  echo "[ERROR] ZIPファイルの削除に失敗しました。"
  # 必要なら exit するかどうかを検討
  # exit 1
fi

############################
# 4. Lambdaの更新
############################
echo "=== Updating Lambda function code ==="
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --s3-bucket "$S3_BUCKET" \
  --s3-key "$S3_KEY" \
  --publish \
  --no-cli-pager
if [ $? -ne 0 ]; then
  echo "[ERROR] Lambda関数の更新に失敗しました。"
  exit 1
fi

############################
# 5. 終了メッセージ (viメッセージが残るのを消すためにclear)
############################
echo "=== Deployment complete! ==="
