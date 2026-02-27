import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeUpload, createMemoryDraft, uploadMemoryAudio } from "../services/memory";

function getSupportedAudioConfig() {
  const candidates = [
    { mimeType: "audio/mp4", ext: "m4a" },
    { mimeType: "audio/webm;codecs=opus", ext: "webm" },
    { mimeType: "audio/webm", ext: "webm" },
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" }
  ];

  for (const item of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(item.mimeType)) return item;
  }
  return { mimeType: "", ext: "webm" };
}

export default function RecordMemory() {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  const [status, setStatus] = useState("Ready");
  const [recording, setRecording] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const navigate = useNavigate();

  async function startRecording() {
    try {
      if (!title.trim()) {
        setError("Please enter a memory title first.");
        return;
      }
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const config = getSupportedAudioConfig();
      const recorder = config.mimeType ? new MediaRecorder(stream, { mimeType: config.mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start(200);
      setRecording(true);
      setStatus("Recording...");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((prev) => prev + 1), 1000);
    } catch {
      setError("Microphone access failed. Please allow microphone permission and try again.");
    }
  }

  async function stopRecording() {
    if (!recorderRef.current) return;

    recorderRef.current.onstop = async () => {
      try {
        setStatus("Saving...");

        const config = getSupportedAudioConfig();
        const finalMimeType = recorderRef.current?.mimeType || config.mimeType || "audio/webm";
        const finalExt = finalMimeType.includes("mp4") ? "m4a" : finalMimeType.includes("ogg") ? "ogg" : "webm";

        const blob = new Blob(chunksRef.current, { type: finalMimeType });
        const file = new File([blob], `memory-${Date.now()}.${finalExt}`, { type: finalMimeType });

        // Get actual audio duration from the blob
        let audioDurationSec = 0;
        try {
          const audio = new Audio(URL.createObjectURL(blob));
          audioDurationSec = await new Promise((resolve) => {
            audio.addEventListener('loadedmetadata', () => resolve(Math.round(audio.duration) || 0));
            audio.addEventListener('error', () => resolve(0));
            // Fallback timeout in case metadata never loads
            setTimeout(() => resolve(0), 5000);
          });
        } catch {
          audioDurationSec = 0;
        }

        // Create draft first with error handling
        let draft;
        try {
          draft = await createMemoryDraft({ title, isPublic });
        } catch (draftError) {
          setStatus("Failed.");
          const detail = draftError?.response?.data?.detail || draftError?.response?.data?.message;
          setError(detail ? `Failed to create memory: ${detail}` : "Failed to create memory. Please try again.");
          return;
        }

        const uploaded = await uploadMemoryAudio({ memoryId: draft.memoryId, file, onProgress: setUploadProgress });

        const done = await completeUpload({
          memoryId: draft.memoryId,
          audioUrl: uploaded.audioUrl,
          audioMimeType: uploaded.audioMimeType || finalMimeType,
          audioDurationSec
        });

        setStatus("Completed.");
        setTimeout(() => navigate(`/story/${done.memory._id}`), 1200);
      } catch (e) {
        setStatus("Failed.");
        const detail = e?.response?.data?.detail || e?.response?.data?.message;
        setError(detail ? `Saving failed: ${detail}` : "Saving failed. Please try recording again.");
      }
    };

    recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  }

  const minuteText = `${String(Math.floor(seconds / 60)).padStart(1, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main className="page">
      <section className="panel record-hero">
        <h1 className="record-title">
          Your story <span>matters</span>
        </h1>
        <p className="record-subtitle">Share a memory, a moment, a feeling. We will preserve it forever.</p>
        <label className="record-field">
          Story Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Example: Summer Sundays in Savannah"
          />
        </label>
        <label className="record-checkbox">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Share this story with other users after transcription
        </label>
        <p className="status-text" aria-live="polite">{status}</p>
        {error ? <p className="error">{error}</p> : null}

        <div className="action-row centered">
          {status === "Completed." ? <div className="btn-record-circle saved-circle">✓</div> : null}
          {!recording && status !== "Completed." ? (
            <button className="btn-record btn-record-circle" onClick={startRecording} aria-label="Start recording">🎙️</button>
          ) : null}
          {recording ? (
            <button className="btn-stop btn-record-circle" onClick={stopRecording} aria-label="Stop and save recording">■</button>
          ) : null}
        </div>

        {recording ? (
          <>
            <div className="mini-eq" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <p className="record-timer">{minuteText}</p>
            <p className="recording-text">Recording...</p>
          </>
        ) : null}

        <h2 className="record-cta-title">{status === "Completed." ? "Memory Saved!" : "Record a Memory"}</h2>
        <p className="muted">{status === "Completed." ? "Your story has been preserved" : "Tap the button and start speaking"}</p>

        {status === "Saving..." ? <p>Upload Progress: {uploadProgress}%</p> : null}
        {recording ? <button className="btn-stop-text" onClick={stopRecording}>Tap to Stop</button> : null}
      </section>
    </main>
  );
}
