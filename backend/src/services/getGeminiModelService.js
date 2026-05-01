import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let textModel = null;
let imageModel = null;

export function getGeminiModelForText() {
    if (!GEMINI_API_KEY) return null;
    if (!textModel) {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        textModel = genAI.getGenerativeModel({ model: 'gemma-3-4b-it' });
    }
    return textModel;
}

export function getGeminiModelForImage() {
    if (!GEMINI_API_KEY) return null;
    if (!imageModel) {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        imageModel = genAI.getGenerativeModel({ model: 'gemma-3-12b-it' });
    }
    return imageModel;
}