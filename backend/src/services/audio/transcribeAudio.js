import { AssemblyAI } from 'assemblyai';

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

let client = null;

function getAssemblyAIClient() {
    if (!ASSEMBLYAI_API_KEY) return null;

    if (!client) {
        client = new AssemblyAI({
            apiKey: ASSEMBLYAI_API_KEY,
        });
    }

    return client;
}

export async function transcribeAudioFromBuffer(buffer, filename = 'voice_message.webm', mimeType = 'audio/webm') {
    try {
        const assemblyClient = getAssemblyAIClient();

        if (!assemblyClient) {
            console.error('AssemblyAI client is not initialized. Missing ASSEMBLYAI_API_KEY.');
            return '';
        }

        if (!buffer || !Buffer.isBuffer(buffer)) {
            console.error('Invalid audio buffer.');
            return '';
        }

        if (mimeType !== 'audio/webm') {
            console.error(`Unsupported audio mime type: ${mimeType}`);
            return '';
        }

        const transcript = await assemblyClient.transcripts.transcribe({
            audio: buffer,

            speech_models: ['universal-3-pro', 'universal-2'],

            language_code: 'vi',
        });

        if (transcript.status === 'error') {
            console.error('AssemblyAI transcription error:', transcript.error);
            return '';
        }

        return transcript.text?.trim() || '';
    } catch (error) {
        console.error('AssemblyAI transcription exception:', error);
        return '';
    }
}