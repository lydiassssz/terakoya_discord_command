import AWS from 'aws-sdk';
import dotenv from 'dotenv';
dotenv.config();

// DynamoDBクライアントを初期化
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// テーブル名
const TABLE_NAME = process.env.DYNAMODB_TOKEN_TABLE_NAME;
const ERROR_LOG_TABLE_NAME = 'Terakoya_error_log';

/**
 * エラーをログとして記録する関数
 * @param {string} user_id - ユーザーID
 * @param {string} error_message - エラー内容
 * @param {object} input_data - 入力データ
 */
const log_error = async (user_id, error_message, input_data) => {
    const timestamp = new Date().toISOString();

    const params = {
        TableName: ERROR_LOG_TABLE_NAME,
        Item: {
            timestamp,
            user_id,
            error_message,
            input_data
        }
    };

    try {
        await dynamoDB.put(params).promise();
        console.error('Error logged successfully');
    } catch (error) {
        console.error('Failed to log error:', error);
    }
};

/**
 * トークンを取引する関数
 * @param {string} user_id - ユーザーID
 * @param {number} amount - 増減するトークン量（正の値で追加、負の値で減算）
 * @param {string} description - 処理の説明（任意）
 */
export const transact_token = async (user_id, amount, description = "Unknown") => {
    const timestamp = new Date().toISOString();
    const transaction_id = `txn_${timestamp}`;

    // トークン残高を取得
    const balanceParams = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'user_id = :user_id',
        ExpressionAttributeValues: {
            ':user_id': user_id
        },
        ProjectionExpression: 'current_tokens',
        Limit: 1,
        ScanIndexForward: false
    };

    try {
        const balanceResult = await dynamoDB.query(balanceParams).promise();
        const currentBalance = balanceResult.Items.length > 0 ? balanceResult.Items[0].current_tokens : 0;

        // 減算処理でマイナスになる場合はエラーを返す
        if (amount < 0 && currentBalance + amount < 0) {
            throw new Error('Insufficient tokens: Transaction would result in a negative balance');
        }

        const newBalance = currentBalance + amount;

        const params = {
            TableName: TABLE_NAME,
            Item: {
                user_id,
                timestamp,
                transaction_id,
                amount,
                current_tokens: newBalance,
                description
            }
        };

        await dynamoDB.put(params).promise();
        return { message: `Token transaction successful`, updatedTokens: newBalance };
    } catch (error) {
        console.error('Error in token transaction:', error);
        await log_error(user_id, error.message, { user_id, amount, description });
        throw new Error(error.message);
    }
};

/**
 * トークン残高を確認する関数
 * @param {string} user_id - ユーザーID
 */
export const check_token_balance = async (user_id) => {
    try {
        const balanceParams = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'user_id = :user_id',
            ExpressionAttributeValues: {
                ':user_id': user_id
            },
            ProjectionExpression: 'current_tokens',
            Limit: 1,
            ScanIndexForward: false
        };

        const balanceResult = await dynamoDB.query(balanceParams).promise();
        const currentBalance = balanceResult.Items.length > 0 ? balanceResult.Items[0].current_tokens : 0;

        return { message: 'Token balance retrieved', current_tokens: currentBalance };
    } catch (error) {
        console.error('Error retrieving token balance:', error);
        await log_error(user_id, error.message, { user_id });
        throw new Error('Could not retrieve token balance');
    }
};

/**
 * メインハンドラ
 */
export const handler = async (event) => {
    const { action, user_id, amount, description } = JSON.parse(event.body);

    try {
        switch (action) {
            case 'transact':
                return {
                    statusCode: 200,
                    body: JSON.stringify(await transact_token(user_id, amount, description))
                };

            case 'check':
                return {
                    statusCode: 200,
                    body: JSON.stringify(await check_token_balance(user_id))
                };

            default:
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Invalid action' })
                };
        }
    } catch (error) {
        await log_error(user_id, error.message, { action, user_id, amount, description });
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message })
        };
    }
};
