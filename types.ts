
export interface GroundingSource {
    uri: string;
    title: string;
}

export interface TranscriptEntry {
    speaker: 'user' | 'assistant';
    text: string;
    sources?: GroundingSource[];
}

/**
 * Represents the media blob structure expected by the Gemini API's live.connect method.
 * This type is defined locally as it is not exported from the @google/genai package.
 */
export type Blob = {
    data: string; // Base64 encoded string.
    mimeType: string;
};

// FIX: Add local type definition for LiveSession as it is not exported from @google/genai.
/**
 * Represents the live session object returned by ai.live.connect.
 * This type is defined locally as it is not exported from the @google/genai package.
 */
export interface LiveSession {
    close(): void;
    sendRealtimeInput(input: { media: Blob }): void;
}
