import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let model = null;

export function getGeminiModel() {
    if (!GEMINI_API_KEY) return null;
    if (!model) {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    }
    return model;
}