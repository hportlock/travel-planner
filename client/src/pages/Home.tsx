import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TripRow, UserRow } from '@travel-plan/shared';
import { listTrips, logout, me } from '../api/client';

export default function Home(): JSX.Element {
  const [user, setUser] = useState<UserRow | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    me()
      .then(async (res) => {
        if (!active) return;
        setUser(res.user);
        if (res.user) {
          const list = await listTrips().catch(() => [] as TripRow[]);
          if (active) setTrips(list);
        }
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-[760px] px-5 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-[28px] font-extrabold text-ink">Travel Plan ✈︎</h1>
        {user ? (
          <button
            type="button"
            onClick={() => {
              void logout().then(() => window.location.reload());
            }}
            className="rounded-full border-2 border-[#e7d6ba] bg-white px-4 py-2 text-[13px] font-extrabold text-[#6a553c]"
          >
            Log out
          </button>
        ) : null}
      </header>

      {loading ? (
        <p className="font-semibold text-[#8a6f4c]">Loading…</p>
      ) : !user ? (
        <div className="rounded-card border-2 border-[#e7d6ba] bg-white px-6 py-8 text-center">
          <p className="mb-4 font-semibold text-[#6a553c]">Sign in to view and manage your trips.</p>
          <Link
            to="/login"
            className="inline-flex rounded-full bg-coral px-5 py-2.5 font-extrabold text-white"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div>
          <p className="mb-4 font-semibold text-[#6a553c]">Welcome back, {user.name}.</p>
          {trips.length === 0 ? (
            <p className="font-semibold text-[#8a6f4c]">No trips yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {trips.map((t) => (
                <li key={t.id}>
                  <Link
                    to={`/trip/${t.id}`}
                    className="block rounded-card border-2 border-[#e7d6ba] bg-white px-5 py-4 shadow-[0_8px_0_#efe1c8] transition hover:-translate-y-0.5"
                  >
                    <div className="font-display text-[17px] font-extrabold text-ink">{t.title}</div>
                    {t.subtitle ? (
                      <div className="mt-0.5 text-[13px] font-semibold text-[#6a553c]">{t.subtitle}</div>
                    ) : null}
                    {t.destination ? (
                      <div className="mt-1 font-mono text-[12px] text-[#8a6f4c]">{t.destination}</div>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
