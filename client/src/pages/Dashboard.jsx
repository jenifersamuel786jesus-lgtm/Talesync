import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MemoryCard from "../components/MemoryCard";
import { getUser, logout } from "../services/auth";
import { getMyMemories, getPublicFeed } from "../services/memory";

export default function Dashboard() {
  const [memories, setMemories] = useState([]);
  const [globalMemories, setGlobalMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = getUser();
  const navigate = useNavigate();

  useEffect(() => {
    Promise.allSettled([getMyMemories(), getPublicFeed()])
      .then(([mine, global]) => {
        setMemories(mine.status === "fulfilled" ? mine.value.memories : []);
        setGlobalMemories(global.status === "fulfilled" ? global.value.memories : []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>Welcome, {user?.name || "Friend"}</h1>
          <p className="muted">Your life stories are safe and searchable.</p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => {
            logout();
            navigate("/auth");
          }}
        >
          Logout
        </button>
      </header>

      <section className="panel hero-panel">
        <Link to="/record" className="btn-record">Record a Memory</Link>
        <p className="hero-note">Tap once, speak naturally, and Talesync saves your story safely.</p>
      </section>

      <section className="panel">
        <h2>My Stories</h2>
        {loading ? <p>Loading your memories...</p> : null}
        <div className="memory-grid">
          {memories.map((memory) => (
            <MemoryCard key={memory._id} memory={memory} />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Global Memory Feed</h2>
        <p className="muted">Stories shared by other users after transcription is completed.</p>
        <div className="memory-grid">
          {globalMemories.map((memory) => (
            <MemoryCard key={memory._id} memory={memory} />
          ))}
        </div>
        {!loading && globalMemories.length === 0 ? <p>No public stories yet.</p> : null}
      </section>
    </main>
  );
}
