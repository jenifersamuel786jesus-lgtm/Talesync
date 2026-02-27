import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";

export default function MemoryCard({ memory }) {
  const created = new Date(memory.createdAt || Date.now()).toLocaleDateString();
  return (
    <article className="memory-card">
      <div className="card-row">
        <h3>{memory.title || memory.topic || "Untitled memory"}</h3>
        <StatusBadge status={memory.status} />
      </div>
      <p>{memory.transcript?.slice(0, 140) || "Processing in progress..."}</p>
      <p className="card-date">{created}</p>
      <div className="tags">
        {memory.entities?.people?.slice(0, 2).map((name) => (
          <span key={name} className="tag">#{name}</span>
        ))}
      </div>
      <div className="card-row card-actions">
        <Link to={`/story/${memory._id}`} className="btn-secondary">View Story</Link>
        <Link to={`/chain/${memory._id}`} className="btn-secondary">Memory Chain</Link>
      </div>
    </article>
  );
}
