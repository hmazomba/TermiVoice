
import React from 'react';
import { CloseIcon } from './Icons';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  audioDevices: MediaDeviceInfo[];
  selectedMicId: string | undefined;
  onMicChange: (deviceId: string) => void;
  micGain: number;
  onGainChange: (gain: number) => void;
  systemInstruction: string;
  onSystemInstructionChange: (instruction: string) => void;
}

const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  audioDevices,
  selectedMicId,
  onMicChange,
  micGain,
  onGainChange,
  systemInstruction,
  onSystemInstructionChange,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-black border-2 border-green-700 rounded-md p-6 w-full max-w-md text-green-400 font-mono">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Settings</h2>
          <button onClick={onClose} className="text-green-400 hover:text-white transition-colors" aria-label="Close settings">
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label htmlFor="mic-select" className="block mb-2 text-lg">
              Microphone Input
            </label>
            <select
              id="mic-select"
              value={selectedMicId || ''}
              onChange={(e) => onMicChange(e.target.value)}
              className="w-full bg-gray-900 border border-green-700 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Select microphone"
            >
              {audioDevices.length > 0 ? (
                audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                  </option>
                ))
              ) : (
                <option disabled>No microphones found</option>
              )}
            </select>
          </div>

          <div>
            <label htmlFor="gain-slider" className="block mb-2 text-lg">
              Input Sensitivity (Gain)
            </label>
            <div className="flex items-center gap-4">
              <input
                id="gain-slider"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={micGain}
                onChange={(e) => onGainChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                aria-label="Adjust input sensitivity"
              />
              <span className="bg-gray-900 border border-green-700 px-2 py-1 rounded-md w-16 text-center">
                {micGain.toFixed(1)}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="system-instruction" className="block mb-2 text-lg">
              System Instruction
            </label>
            <textarea
              id="system-instruction"
              rows={4}
              value={systemInstruction}
              onChange={(e) => onSystemInstructionChange(e.target.value)}
              className="w-full bg-gray-900 border border-green-700 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
              aria-label="Edit system instruction"
            />
            <p className="text-xs mt-1 text-gray-500">
              Changes will be applied the next time you start a session.
            </p>
          </div>

          <div>
            <label htmlFor="samplerate-select" className="block mb-2 text-lg">
              Audio Sample Rate
            </label>
            <select
              id="samplerate-select"
              disabled
              className="w-full bg-gray-800 border border-green-800 p-2 rounded-md disabled:opacity-50 cursor-not-allowed"
              aria-label="Audio sample rate"
            >
              <option>16000 Hz</option>
            </select>
            <p className="text-xs mt-1 text-gray-500">
              Gemini API requires a 16000 Hz sample rate for audio input.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
