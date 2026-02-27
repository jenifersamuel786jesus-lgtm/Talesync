export default function StatusBadge({ status }) {
  const className = `status status-${status}`;
  return <span className={className}>{status}</span>;
}
