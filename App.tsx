
import React, { useState, useRef, useEffect, useCallback } from 'react';
// FIX: The type `LiveSession` is not exported from the '@google/genai' package.
// It is now defined in and imported from `./types.ts`.
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { type TranscriptEntry, type Blob, type LiveSession } from './types';
import { encode, decode, decodeAudioData, createBlob } from './utils/audio';
import { MicrophoneIcon, StopIcon, DownloadIcon, SettingsIcon } from './components/Icons';
import Settings from './components/Settings';
import AudioVisualizer from './components/AudioVisualizer';

const App: React.FC = () => {
    const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string>('IDLE :: Press START to begin');
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [isGroundingEnabled, setIsGroundingEnabled] = useState<boolean>(false);

    // Settings State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedMicId, setSelectedMicId] = useState<string | undefined>();
    const [micGain, setMicGain] = useState(1);
    const [restartSessionTrigger, setRestartSessionTrigger] = useState(0);
    const [systemInstruction, setSystemInstruction] = useState<string>('You are TermVoice, a helpful and informative terminal-based AI assistant. Respond concisely, prioritizing accuracy and clarity. Avoid conversational filler.');

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const analyserNodeRef = useRef<AnalyserNode | null>(null);

    const currentInputTranscriptionRef = useRef<string>('');
    const currentOutputTranscriptionRef = useRef<string>('');
    const nextAudioStartTimeRef = useRef<number>(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [transcript]);

    useEffect(() => {
        if (restartSessionTrigger > 0) {
            startSession();
        }
    }, [restartSessionTrigger]);

    const openSettingsPanel = useCallback(async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput');
            setAudioDevices(mics);
            if (mics.length > 0 && !selectedMicId) {
                setSelectedMicId(mics[0].deviceId);
            }
            setIsSettingsOpen(true);
        } catch (error: any) {
            console.error("Could not get audio devices:", error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                setStatusMessage('ERROR :: Microphone access is required to list and select devices.');
            } else {
                setStatusMessage('ERROR :: Could not enumerate audio devices.');
            }
        }
    }, [selectedMicId]);

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

            const groundingChunks = (message.serverContent as any)?.groundingMetadata?.groundingChunks || [];
            const sources = groundingChunks
                .map((chunk: any) => chunk.web)
                .filter(Boolean)
                .map((web: any) => ({ uri: web.uri, title: web.title }))
                .filter((source: any) => source.uri && source.title);

            if (fullInput) {
                setTranscript(prev => [...prev, { speaker: 'user', text: fullInput }]);
            }
            if (fullOutput) {
                setTranscript(prev => [...prev, { speaker: 'assistant', text: fullOutput, sources: sources.length > 0 ? sources : undefined }]);
            }

            const lowerCaseInput = fullInput.toLowerCase();
            if (lowerCaseInput.includes('open settings') || lowerCaseInput.includes('show settings')) {
                openSettingsPanel();
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
    }, [openSettingsPanel]);
    
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
        if (gainNodeRef.current) {
            gainNodeRef.current.disconnect();
            gainNodeRef.current = null;
        }
        if (analyserNodeRef.current) {
            analyserNodeRef.current.disconnect();
            analyserNodeRef.current = null;
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
        // 1. Get Microphone Access
        try {
            setStatusMessage('INITIALIZING :: Requesting microphone access...');
            const audioConstraints = {
                audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
            };
            const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
            mediaStreamRef.current = stream;
        } catch (error: any) {
            console.error('Microphone access error:', error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                setStatusMessage('ERROR :: Microphone access denied. Please grant permission in your browser settings.');
            } else if (error.name === 'NotFoundError') {
                setStatusMessage('ERROR :: No microphone found. Please connect a microphone and try again.');
            } else {
                setStatusMessage('ERROR :: Could not access microphone.');
            }
            return; 
        }

        // 2. Connect to Gemini API
        try {
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            setStatusMessage('CONNECTING :: Establishing connection to Gemini...');

            const sessionConfig: any = {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Leda' },
                    },
                },
                systemInstruction: systemInstruction
            };
        
            if (isGroundingEnabled) {
                sessionConfig.tools = [{ googleSearch: {} }];
            }
            
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        if (!inputAudioContextRef.current || !mediaStreamRef.current) return;
                        setStatusMessage('LISTENING :: Waiting for your command...');
                        setIsSessionActive(true);
                        
                        mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
                        gainNodeRef.current = inputAudioContextRef.current.createGain();
                        gainNodeRef.current.gain.value = micGain;
                        scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                        analyserNodeRef.current = inputAudioContextRef.current.createAnalyser();


                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob: Blob = createBlob(inputData);
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        mediaStreamSourceRef.current.connect(gainNodeRef.current);
                        gainNodeRef.current.connect(analyserNodeRef.current);
                        analyserNodeRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: handleSessionMessage,
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        setStatusMessage(`SESSION_ERROR :: ${e.message || 'Connection lost.'}`);
                        stopSession();
                    },
                    onclose: (e: CloseEvent) => {
                        console.log('Session closed.');
                         if (isSessionActive) {
                            stopSession();
                         }
                    },
                },
                config: sessionConfig,
            });

        } catch (error) {
            console.error('Failed to connect to Gemini API:', error);
            setStatusMessage('ERROR :: Failed to connect to Gemini API. Check your connection.');
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
                mediaStreamRef.current = null;
            }
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
        const formattedTranscript = transcript.map(entry => {
            const sourcesText = (entry.sources || [])
                .map(source => `  - [${source.title}](${source.uri})`)
                .join('\n');
            const mainText = `${entry.speaker.toUpperCase()}: ${entry.text}`;
            return sourcesText ? `${mainText}\n[SOURCES]\n${sourcesText}` : mainText;
        }).join('\n\n');

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

    const handleMicChange = async (deviceId: string) => {
        if (deviceId === selectedMicId) return;

        if (isSessionActive) {
            await stopSession();
            setSelectedMicId(deviceId);
            setRestartSessionTrigger(c => c + 1); // Trigger useEffect to restart
        } else {
            setSelectedMicId(deviceId);
        }
    };
    
    const handleGainChange = (newGain: number) => {
        setMicGain(newGain);
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = newGain;
        }
    };

    const handleSystemInstructionChange = (newInstruction: string) => {
        setSystemInstruction(newInstruction);
    };


    return (
        <div className="flex flex-col h-screen max-h-screen bg-black font-mono p-2 sm:p-4">
            <Settings 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                audioDevices={audioDevices}
                selectedMicId={selectedMicId}
                onMicChange={handleMicChange}
                micGain={micGain}
                onGainChange={handleGainChange}
                systemInstruction={systemInstruction}
                onSystemInstructionChange={handleSystemInstructionChange}
            />
            <header className="flex-shrink-0 border-b-2 border-green-700 pb-2 mb-2 flex justify-between items-center">
                <h1 className="text-xl sm:text-2xl font-bold text-green-400">TermVoice Web</h1>
                <div className="flex items-center gap-4">
                    <button onClick={openSettingsPanel} className="text-green-400 hover:text-white transition-colors" aria-label="Open settings">
                        <SettingsIcon />
                    </button>
                    <div className="text-xs text-gray-500">/usr/bin/gemini</div>
                </div>
            </header>
            
            <main className="flex-grow overflow-y-auto p-2 border-2 border-green-700 rounded-md mb-2 bg-black">
                <div className="flex flex-col">
                    {transcript.map((entry, index) => (
                         <div key={index} className="mb-4 last:mb-0">
                            <div className="flex gap-2">
                                <span className={`flex-shrink-0 ${entry.speaker === 'user' ? 'text-cyan-400' : 'text-yellow-400'}`}>
                                    {entry.speaker === 'user' ? 'user@local:~$' : 'gemini@cloud:~#'}
                                </span>
                                <p className="text-green-400 whitespace-pre-wrap">{entry.text}</p>
                            </div>
                            {entry.speaker === 'assistant' && entry.sources && entry.sources.length > 0 && (
                                <div className="mt-2 pl-[16ch]">
                                    <div className="text-yellow-500 text-sm font-bold">[SOURCES]</div>
                                    <ul className="mt-1 space-y-1">
                                        {entry.sources.map((source, i) => (
                                            <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                                                <span className='text-gray-500'>{i + 1}.</span>
                                                <a
                                                    href={source.uri}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="hover:text-green-400 hover:underline truncate"
                                                    title={source.title}
                                                >
                                                   {source.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={transcriptEndRef} />
                </div>
            </main>

            <footer className="flex-shrink-0">
                <div className="bg-gray-900 border border-green-700 text-green-400 text-sm p-2 rounded-md mb-2 flex items-center gap-2">
                   <AudioVisualizer analyserNode={analyserNodeRef.current} isActive={isSessionActive} />
                   <span className="flex-1">{statusMessage}</span>
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
                     <div className="flex items-center space-x-2">
                        <label
                            htmlFor="grounding-toggle"
                            className={`text-sm font-bold select-none ${isSessionActive ? 'text-gray-500 cursor-not-allowed' : 'text-green-400 cursor-pointer'}`}
                        >
                            Google Search
                        </label>
                        <button
                            type="button"
                            id="grounding-toggle"
                            role="switch"
                            aria-checked={isGroundingEnabled}
                            onClick={() => !isSessionActive && setIsGroundingEnabled(!isGroundingEnabled)}
                            disabled={isSessionActive}
                            className={`${
                            isGroundingEnabled ? 'bg-green-600' : 'bg-gray-700'
                            } relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <span
                                aria-hidden="true"
                                className={`${
                                    isGroundingEnabled ? 'translate-x-5' : 'translate-x-0'
                                } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                            />
                        </button>
                    </div>
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
