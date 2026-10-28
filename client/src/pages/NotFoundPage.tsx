import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
      <p className="text-6xl font-bold text-muted-foreground/30">404</p>
      <div>
        <p className="text-lg font-semibold">Page not found</p>
        <p className="text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
      </div>
      <Link to="/" className="btn-primary px-4 py-2">
        Back to Dashboard
      </Link>
    </div>
  );
}