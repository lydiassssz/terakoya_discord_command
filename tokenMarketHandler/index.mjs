import AWS from 'aws-sdk';

// DynamoDBクライアントを初期化
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// テーブル名
const TABLE_NAME = 'token_transactions';

/**
 * トークンを取引する関数
 * @param {string} user_id - ユーザーID
 * @param {number} amount - 増減するトークン量（正の値で追加、負の値で減算）
 */
export const transact_token = async (user_id, amount) => {
    const timestamp = new Date().toISOString();
    const transaction_id = `txn_${timestamp}`;
    const description = amount > 0 ? 'Added tokens' : 'Subtracted tokens';

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

        const params = {
            TableName: TABLE_NAME,
            Key: { user_id, timestamp },
            UpdateExpression: `
                SET
                    current_tokens = if_not_exists(current_tokens, :start) + :amount,
                    description = :description,
                    transaction_id = :transaction_id
            `,
            ExpressionAttributeValues: {
                ':start': 0, // 初期値
                ':amount': amount,
                ':description': description,
                ':transaction_id': transaction_id
            },
            ReturnValues: 'UPDATED_NEW'
        };

        const result = await dynamoDB.update(params).promise();
        return { message: `Token transaction successful`, updatedTokens: result.Attributes.current_tokens };
    } catch (error) {
        console.error('Error in token transaction:', error);
        throw new Error(error.message);
    }
};

/**
 * トークン残高を確認する関数
 * @param {string} user_id - ユーザーID
 */
export const check_token_balance = async (user_id) => {
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'user_id = :user_id',
        ExpressionAttributeValues: {
            ':user_id': user_id
        },
        ProjectionExpression: 'current_tokens', // 必要なフィールドのみ取得
        Limit: 1, // 最新の値だけを取得する
        ScanIndexForward: false // 時系列降順で取得
    };

    try {
        const result = await dynamoDB.query(params).promise();
        if (result.Items.length === 0) {
            return { message: 'No token data found', current_tokens: 0 };
        }
        return { message: 'Token balance retrieved', current_tokens: result.Items[0].current_tokens };
    } catch (error) {
        console.error('Error retrieving token balance:', error);
        throw new Error('Could not retrieve token balance');
    }
};

/**
 * メインハンドラ
 */
export const handler = async (event) => {
    const { action, user_id, amount } = JSON.parse(event.body);

    try {
        switch (action) {
            case 'transact':
                return {
                    statusCode: 200,
                    body: JSON.stringify(await transact_token(user_id, amount))
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
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message })
        };
    }
};
