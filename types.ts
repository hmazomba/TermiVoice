
export interface TranscriptEntry {
    speaker: 'user' | 'assistant';
    text: string;
}

/**
 * Represents the media blob structure expected by the Gemini API's live.connect method.
 * This type is defined locally as it is not exported from the @google/genai package.
 */
export type Blob = {
    data: string; // Base64 encoded string.
    mimeType: string;
};
