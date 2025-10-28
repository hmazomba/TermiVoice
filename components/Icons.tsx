
import React from 'react';

export const MicrophoneIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
);

export const StopIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6" />
    </svg>
);

export const DownloadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

interface StatusIconProps {
  status: string;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ status }) => {
  const lowerStatus = status.toLowerCase();
  
  if (lowerStatus.includes('listening') || lowerStatus.includes('speaking')) {
    return <div className="w-4 h-4 rounded-full bg-green-500 animate-pulse"></div>;
  }
  if (lowerStatus.includes('error')) {
    return <div className="w-4 h-4 rounded-full bg-red-500"></div>;
  }
  if (lowerStatus.includes('idle') || lowerStatus.includes('ended')) {
    return <div className="w-4 h-4 rounded-full bg-gray-500"></div>;
  }
  return <div className="w-4 h-4 rounded-full bg-yellow-500 animate-spin"></div>; // Connecting, Initializing etc.
};
