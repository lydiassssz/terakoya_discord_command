#!/bin/bash
#
# deploy.sh (実行権限を付与して使います)
#   1. 対象フォルダをZIP圧縮
#   2. S3にアップロード
#   3. Lambdaを更新
#
# 使い方:
#   bash deploy.sh
#     (あるいは ./deploy.sh として実行できるように chmod +x しておく)
#

############################
# 設定値
############################

# Lambda関数名 (arn ではなく関数名)
FUNCTION_NAME="discordHelloHandler"

# S3バケット名 (zipをアップロードする先)
S3_BUCKET="terakoyalambda"

# S3内のオブジェクトキー (パス) ※フォルダ構造にしたい場合は "some/folder/function.zip" など
S3_KEY="discordHelloHandler.zip"

# ZIPファイルの出力先
ZIP_FILE="discordHelloHandler.zip"

# AWS CLIのプロファイル名(必要に応じて)
AWS_PROFILE="s3AndLambdaAccess"  
# ↑特に切り替える必要なければ、 default のままか --profile 自体を削除してもOK

############################
# 1. ZIP圧縮
############################
echo "=== Zipping source code ==="
# 下記例では、node_modulesなど含めずにzipを作成したいときは -x オプションで除外してください
zip -r "$ZIP_FILE" . \
    -x ".git/*" \
    -x ".DS_Store" \
    -x "deploy.sh" \
    -x "lambda=test.mjs" \
    -x "local=test.mjs"

# zipコマンドが成功したか確認
if [ $? -ne 0 ]; then
  echo "[ERROR] zipコマンドに失敗しました。"
  exit 1
fi

############################
# 2. S3へアップロード
############################
echo "=== Uploading ${ZIP_FILE} to s3://${S3_BUCKET}/${S3_KEY} ==="
aws s3 cp "$ZIP_FILE" "s3://${S3_BUCKET}/${S3_KEY}" --profile "$AWS_PROFILE"
if [ $? -ne 0 ]; then
  echo "[ERROR] S3へのアップロードに失敗しました。"
  exit 1
fi

############################
# 3. Lambdaの更新
############################
echo "=== Updating Lambda function code ==="
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --s3-bucket "$S3_BUCKET" \
  --s3-key "$S3_KEY" \
  --publish \
  --profile "$AWS_PROFILE"
if [ $? -ne 0 ]; then
  echo "[ERROR] Lambda関数の更新に失敗しました。"
  exit 1
fi

echo "=== Deployment complete! ==="
