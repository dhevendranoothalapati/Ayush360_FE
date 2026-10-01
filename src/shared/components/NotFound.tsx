import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="center-state">
      <div>
        <h2>Page not found</h2>
        <p>The page you are looking for does not exist.</p>
        <Link className="btn btn-secondary" to="/">
          Go to home
        </Link>
      </div>
    </div>
  );
}
