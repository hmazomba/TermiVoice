
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, LiveSession } from '@google/genai';
import { type TranscriptEntry, type Blob } from './types';
import { encode, decode, decodeAudioData, createBlob } from './utils/audio';
import { MicrophoneIcon, StopIcon, DownloadIcon, StatusIcon } from './components/Icons';

const App: React.FC = () => {
    const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string>('IDLE :: Press START to begin');
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    const currentInputTranscriptionRef = useRef<string>('');
    const currentOutputTranscriptionRef = useRef<string>('');
    const nextAudioStartTimeRef = useRef<number>(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [transcript]);

    const handleSessionMessage = useCallback(async (message: LiveServerMessage) => {
        if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            currentInputTranscriptionRef.current += text;
        } else if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            currentOutputTranscriptionRef.current += text;
        }

        if (message.serverContent?.turnComplete) {
            const fullInput = currentInputTranscriptionRef.current.trim();
            const fullOutput = currentOutputTranscriptionRef.current.trim();

            if (fullInput) {
                setTranscript(prev => [...prev, { speaker: 'user', text: fullInput }]);
            }
            if (fullOutput) {
                setTranscript(prev => [...prev, { speaker: 'assistant', text: fullOutput }]);
            }

            currentInputTranscriptionRef.current = '';
            currentOutputTranscriptionRef.current = '';
        }

        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio && outputAudioContextRef.current) {
            setStatusMessage('SPEAKING :: Gemini is responding...');
            const outputAudioContext = outputAudioContextRef.current;
            nextAudioStartTimeRef.current = Math.max(
                nextAudioStartTimeRef.current,
                outputAudioContext.currentTime,
            );
            const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                outputAudioContext,
                24000,
                1,
            );
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputAudioContext.destination);
            source.addEventListener('ended', () => {
                audioSourcesRef.current.delete(source);
                if (audioSourcesRef.current.size === 0) {
                     setStatusMessage('LISTENING :: Waiting for your command...');
                }
            });

            source.start(nextAudioStartTimeRef.current);
            nextAudioStartTimeRef.current += audioBuffer.duration;
            audioSourcesRef.current.add(source);
        }
        
        const interrupted = message.serverContent?.interrupted;
        if (interrupted) {
            for (const source of audioSourcesRef.current.values()) {
                source.stop();
            }
            audioSourcesRef.current.clear();
            nextAudioStartTimeRef.current = 0;
            setStatusMessage('INTERRUPTED :: Listening for new command...');
        }
    }, []);
    
    const stopSession = useCallback(async () => {
        setStatusMessage('TERMINATING_SESSION :: Please wait...');
        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) {
                console.error('Error closing session:', e);
            }
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            await inputAudioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            await outputAudioContextRef.current.close();
        }

        sessionPromiseRef.current = null;
        setIsSessionActive(false);
        setStatusMessage('IDLE :: Session ended. Press START to begin again.');
    }, []);


    const startSession = async () => {
        try {
            setStatusMessage('INITIALIZING :: Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            // Fix: Cast window to `any` to support `webkitAudioContext` for older Safari versions.
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            // Fix: Cast window to `any` to support `webkitAudioContext` for older Safari versions.
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            setStatusMessage('CONNECTING :: Establishing connection to Gemini...');
            
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        if (!inputAudioContextRef.current || !mediaStreamRef.current) return;
                        setStatusMessage('LISTENING :: Waiting for your command...');
                        setIsSessionActive(true);
                        
                        mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
                        scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);

                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob: Blob = createBlob(inputData);
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: handleSessionMessage,
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        setStatusMessage(`ERROR :: ${e.message}`);
                        stopSession();
                    },
                    onclose: (e: CloseEvent) => {
                        console.log('Session closed.');
                        stopSession();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction: 'You are TermVoice, a helpful and friendly terminal-based voice assistant. Be concise but informative.'
                },
            });

        } catch (error) {
            console.error('Failed to start session:', error);
            setStatusMessage('ERROR :: Could not access microphone or start session.');
        }
    };
    
    const handleToggleSession = () => {
        if (isSessionActive) {
            stopSession();
        } else {
            startSession();
        }
    };

    const handleExport = () => {
        const formattedTranscript = transcript.map(entry => `${entry.speaker.toUpperCase()}: ${entry.text}`).join('\n\n');
        const blob = new Blob([formattedTranscript], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `termvoice-transcript-${new Date().toISOString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="flex flex-col h-screen max-h-screen bg-black font-mono p-2 sm:p-4">
            <header className="flex-shrink-0 border-b-2 border-green-700 pb-2 mb-2 flex justify-between items-center">
                <h1 className="text-xl sm:text-2xl font-bold text-green-400">TermVoice Web</h1>
                <div className="text-xs text-gray-500">/usr/bin/gemini</div>
            </header>
            
            <main className="flex-grow overflow-y-auto p-2 border-2 border-green-700 rounded-md mb-2 bg-black">
                <div className="flex flex-col gap-4">
                    {transcript.map((entry, index) => (
                        <div key={index} className="flex gap-2">
                            <span className={entry.speaker === 'user' ? 'text-cyan-400' : 'text-yellow-400'}>
                                {entry.speaker === 'user' ? 'user@local:~$' : 'gemini@cloud:~#'}
                            </span>
                            <p className="text-green-400 whitespace-pre-wrap">{entry.text}</p>
                        </div>
                    ))}
                    <div ref={transcriptEndRef} />
                </div>
            </main>

            <footer className="flex-shrink-0">
                <div className="bg-gray-900 border border-green-700 text-green-400 text-sm p-2 rounded-md mb-2 flex items-center gap-2">
                   <StatusIcon status={statusMessage} />
                   <span>{statusMessage}</span>
                </div>
                <div className="flex items-center justify-center gap-4">
                    <button 
                        onClick={handleToggleSession}
                        className={`px-6 py-3 rounded-md text-lg font-bold flex items-center gap-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black
                            ${isSessionActive 
                                ? 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500' 
                                : 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500'}`}
                    >
                        {isSessionActive ? <StopIcon /> : <MicrophoneIcon />}
                        {isSessionActive ? 'STOP' : 'START'}
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={transcript.length === 0}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-lg font-bold flex items-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-blue-500"
                    >
                       <DownloadIcon />
                       EXPORT
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default App;