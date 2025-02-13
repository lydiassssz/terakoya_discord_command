import { sendLogMessage,respondJSON } from '../utils.mjs';

export async function handleViewQuizCommand(body, botToken, logChannelId) {

    const button = {
        type: 2,
        label: 'View Answer',
        style: 1,
        custom_id: 'view_answer'
    };

    const message = {
        content: '旧バージョンのこの問題は、こちらの「回答を見る」を利用してください:',
        components: [
            {
                type: 1,
                components: [button]
            }
        ]
    };
    await sendLogMessage(body, botToken, logChannelId);

    return respondJSON({
        type: 4,
        data: message
    });
    
}