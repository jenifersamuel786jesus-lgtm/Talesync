import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMemoryChain } from "../services/memory";

export default function MemoryChain() {
  const { memoryId } = useParams();
  const [chain, setChain] = useState([]);

  useEffect(() => {
    getMemoryChain(memoryId).then((res) => setChain(res.related || []));
  }, [memoryId]);

  return (
    <main className="page">
      <section className="panel">
        <h1>Memory Chain View</h1>
        <p className="muted">Related stories connected by topic and meaning.</p>
        {chain.length === 0 ? <p>No related memories found yet.</p> : null}
        {chain.map((item) => (
          <article className="memory-card" key={item._id}>
            <h3>{item.topic || "Untitled"}</h3>
            <p>{item.transcript?.slice(0, 180)}</p>
            <Link to={`/story/${item._id}`} className="btn-secondary">Open Story</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
