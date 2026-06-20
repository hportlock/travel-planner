import type { TripDetail } from '@travel-plan/shared';

interface HeroProps {
  trip: TripDetail;
}

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (d: string): string => {
    const dt = new Date(`${d}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  if (start && end) {
    const year = new Date(`${end}T00:00:00`).getFullYear();
    return `${fmt(start)} – ${fmt(end)}, ${year}`;
  }
  return fmt((start ?? end) as string);
}

export default function Hero({ trip }: HeroProps): JSX.Element {
  const stamp = trip.theme?.hero.stamp || '🌺';
  const dates = formatDateRange(trip.start_date, trip.end_date);

  return (
    <header className="tp-hero relative mx-auto mb-6 max-w-[760px] overflow-hidden rounded-card border-[3px] border-white bg-coral px-6 py-6 text-white shadow-[0_16px_36px_rgba(190,80,110,0.32)]">
      {stamp ? (
        <div className="tp-hero-stamp absolute right-4 top-4 flex h-[74px] w-[62px] rotate-[7deg] items-center justify-center rounded-md bg-white/90 text-[34px] shadow-[0_6px_14px_rgba(120,40,70,0.3)]">
          {stamp}
        </div>
      ) : null}

      <span className="font-mono text-[11px] font-bold uppercase tracking-[3px] opacity-90">
        ✈︎ {trip.destination || 'Your trip'}
      </span>

      <h1 className="tp-hero-title mt-2 max-w-[88%] font-display text-[clamp(30px,8vw,46px)] font-extrabold leading-none">
        {trip.title}
      </h1>

      {trip.subtitle ? (
        <p className="tp-hero-sub mt-2 max-w-[46ch] text-[15px] font-semibold opacity-95">
          {trip.subtitle}
        </p>
      ) : null}

      <div className="tp-meta mt-4 flex flex-wrap gap-2 border-t-2 border-dashed border-white/50 pt-4">
        {dates ? <MetaChip icon="📅" text={dates} /> : null}
        {trip.destination ? <MetaChip icon="📍" text={trip.destination} /> : null}
        {trip.party ? <MetaChip icon="👨‍👩‍👧‍👦" text={trip.party} /> : null}
      </div>
    </header>
  );
}

function MetaChip({ icon, text }: { icon: string; text: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/40 bg-white/20 px-2.5 py-1 font-mono text-[11.5px] font-bold">
      <span aria-hidden>{icon}</span>
      {text}
    </span>
  );
}
