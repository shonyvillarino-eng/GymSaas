import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
      <p className="text-6xl font-bold text-muted-foreground/30">404</p>
      <div>
        <p className="text-lg font-semibold">Página no encontrada</p>
        <p className="text-sm text-muted-foreground">
          La página que buscas no existe o se movió a otro lugar.
        </p>
      </div>
      <Link to="/" className="btn-primary px-4 py-2">
        Volver al panel
      </Link>
    </div>
  );
}