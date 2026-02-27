import { useEffect, useRef } from "react";

export default function Waveform({ stream, active }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);

  useEffect(() => {
    if (!stream || !active) return;

    // Close existing AudioContext if any
    if (contextRef.current) {
      try {
        contextRef.current.close();
      } catch (e) {
        // Ignore errors when closing
      }
    }

    const audioCtx = new AudioContext();
    contextRef.current = audioCtx;
    
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    let frame;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.2;
      let x = 0;
      for (let i = 0; i < bufferLength; i += 1) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillStyle = "#1f8a70";
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(frame);
      if (source) {
        try { source.disconnect(); } catch (e) { /* ignore */ }
      }
      if (analyser) {
        try { analyser.disconnect(); } catch (e) { /* ignore */ }
      }
      if (audioCtx) {
        try { audioCtx.close(); } catch (e) { /* ignore */ }
      }
      contextRef.current = null;
    };
  }, [stream, active]);

  return <canvas ref={canvasRef} width={700} height={140} className="waveform" aria-label="Live waveform" />;
}
