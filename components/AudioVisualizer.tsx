
import React, { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
  analyserNode: AnalyserNode | null;
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyserNode, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    if (!analyserNode || !isActive) {
      // Clear canvas when not active and stop any running animation
      cancelAnimationFrame(animationFrameId.current);
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    
    analyserNode.fftSize = 64;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);

      analyserNode.getByteFrequencyData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      
      const barWidth = (canvas.width / bufferLength);
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 3; 
        
        if (barHeight > 1) { // Only draw bars with some height
            canvasCtx.fillStyle = `rgb(74, 222, 128)`; // tailwind green-400
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        }

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [analyserNode, isActive]);

  return <canvas ref={canvasRef} width="80" height="20" className="w-20 h-5"/>;
};

export default AudioVisualizer;
