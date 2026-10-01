export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-state" role="status">
      <div>
        <div className="spinner" />
        <p>{label}</p>
      </div>
    </div>
  );
}
