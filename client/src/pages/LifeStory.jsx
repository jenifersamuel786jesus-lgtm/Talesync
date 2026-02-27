import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getUser } from "../services/auth";
import {
  deleteMemory,
  getMemoryById,
  getPublicMemoryById,
  retryTranscription,
  setMemoryVisibility
} from "../services/memory";

export default function LifeStory({ publicMode = false }) {
  const { memoryId } = useParams();
  const [memory, setMemory] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const user = getUser();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const loadMemory = async () => {
      try {
        const res = publicMode ? await getPublicMemoryById(memoryId) : await getMemoryById(memoryId);
        if (cancelled) return;
        setMemory(res.memory);

        if (res.memory.status === "completed" && timer) {
          clearInterval(timer);
        }
      } catch {
        if (!cancelled) setNotice("Unable to refresh story right now.");
      }
    };

    loadMemory();
    if (!publicMode) {
      timer = setInterval(loadMemory, 3000);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [memoryId, publicMode]);

  if (!memory) return <main className="page"><p>Loading memory...</p></main>;

  const isOwner = !publicMode && String(memory.userId) === String(user?.id);
  const created = new Date(memory.createdAt || Date.now()).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  async function handleDelete() {
    const confirmed = window.confirm("Delete this story permanently?");
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteMemory(memory._id);
      navigate("/");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleVisibility() {
    setBusy(true);
    try {
      const res = await setMemoryVisibility(memory._id, !memory.isPublic);
      setMemory(res.memory);
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryTranscription() {
    setBusy(true);
    try {
      await retryTranscription(memory._id);
      setNotice("Transcription retried. Please wait a moment.");
      setMemory({ ...memory, status: "processing" });
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/public/story/${memory._id}`;
    if (navigator.share) {
      await navigator.share({ title: memory.title || memory.topic || "Talesync Story", text: "Listen to this story", url });
      return;
    }
    await navigator.clipboard.writeText(url);
    setNotice("Story link copied.");
  }

  return (
    <main className="page">
      <section className="panel story-panel">
        <div className="story-head">
          <div>
            <h1>{memory.title || memory.topic || "Digital Life Story"}</h1>
            <p className="story-date">{created}</p>
          </div>
          <span className="story-badge">{memory.status === "completed" ? "Transcribed" : memory.status}</span>
        </div>

        {notice ? <p className="muted">{notice}</p> : null}
        {memory.status === "failed" && memory.processingError ? <p className="error">Transcription failed: {memory.processingError}</p> : null}

        <div className="story-audio-wrap">
          <audio controls className="full-width story-audio" src={memory.audioUrl}>
            Your browser could not play this audio format.
          </audio>
        </div>

        <div className="card-row card-actions">
          <button className="btn-secondary" onClick={handleShare} disabled={busy}>Send / Share</button>
          {isOwner ? <button className="btn-secondary" onClick={handleToggleVisibility} disabled={busy}>{memory.isPublic ? "Make Private" : "Make Public"}</button> : null}
          {isOwner ? <button className="btn-secondary" onClick={handleRetryTranscription} disabled={busy}>Retry Transcription</button> : null}
          {isOwner ? <button className="btn-stop" onClick={handleDelete} disabled={busy}>Delete</button> : null}
        </div>

        <h2 className="story-section">Transcript</h2>
        <p className="story-text">{memory.transcript || "Still processing your story..."}</p>

        <div className="tags story-tags">
          {memory.entities?.places?.map((item) => <span key={`place-${item}`} className="tag tag-place">PLACE {item}</span>)}
          {memory.entities?.people?.map((item) => <span key={`person-${item}`} className="tag tag-person">PERSON {item}</span>)}
          {memory.entities?.dates?.map((item) => <span key={`date-${item}`} className="tag tag-date">DATE {item}</span>)}
        </div>

        {!publicMode ? <Link to={`/chain/${memory._id}`} className="btn-secondary">View Memory Chain</Link> : null}
      </section>
    </main>
  );
}
