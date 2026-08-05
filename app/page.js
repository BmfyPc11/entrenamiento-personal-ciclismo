import { leerSesion } from '@/lib/strava';
import Login from '@/components/Login';
import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';

export default function Page({ searchParams }) {
  const sesion = leerSesion();
  if (!sesion) return <Login error={searchParams?.error} />;
  return <Dashboard atleta={sesion.atleta} />;
}
