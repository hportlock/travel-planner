import { useEffect } from 'react';
import type { EventWithReviews, RegionsMap } from '@travel-plan/shared';

interface DetailSheetProps {
  event: EventWithReviews | null;
  regions: RegionsMap;
  onClose: () => void;
}

function stars(n: number): string {
  const filled = Math.max(0, Math.min(5, n));
  return '★★★★★'.slice(0, filled) + '☆☆☆☆☆'.slice(0, 5 - filled);
}

export default function DetailSheet({ event, regions, onClose }: DetailSheetProps): JSX.Element | null {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [event, onClose]);

  if (!event) return null;

  const region = regions[event.region];

  const facts: Array<{ label: string; value: string }> = [];
  if (event.drive) facts.push({ label: 'Drive', value: event.drive });
  if (event.cost) facts.push({ label: 'Cost', value: event.cost });
  if (event.ages) facts.push({ label: 'Ages', value: event.ages });
  if (event.booking) facts.push({ label: 'Booking', value: event.booking });
  if (region) facts.push({ label: 'Region', value: region.label });
  if (event.meal) facts.push({ label: 'Meal', value: event.meal });
  if (event.rating) facts.push({ label: 'Rating', value: event.rating });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(48,24,14,0.5)] backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={event.name}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tp-detail max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-[20px] border-[3px] border-white bg-bg sm:rounded-[18px]">
        <div className="relative bg-coral px-6 py-6 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-[42px] w-[42px] items-center justify-center rounded-full border-[1.5px] border-white/45 bg-white/25 text-lg transition hover:rotate-90 hover:bg-white/40"
          >
            ×
          </button>
          <div className="flex h-[64px] w-[64px] rotate-[5deg] items-center justify-center rounded-lg bg-white/90 text-[36px] shadow-[0_6px_14px_rgba(120,40,70,0.28)]">
            {event.emoji || '📍'}
          </div>
          <h2 className="mt-3 font-display text-[23px] font-extrabold leading-tight">{event.name}</h2>
          {region ? (
            <span
              className="tp-region-pill mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] font-extrabold text-white"
              data-region={event.region || undefined}
              style={{ background: region.color }}
            >
              {region.label}
            </span>
          ) : null}
        </div>

        <div className="px-6 pb-7 pt-5">
          {facts.length > 0 ? (
            <div className="mb-5 grid grid-cols-2 gap-2.5">
              {facts.map((f) => (
                <div key={f.label} className="rounded-[10px] border-[1.5px] border-[#e7d6ba] bg-white px-3 py-2.5">
                  <div className="font-mono text-[9.5px] font-extrabold uppercase tracking-wide text-[#9a7f5c]">
                    {f.label}
                  </div>
                  <div className="mt-0.5 text-[12px] font-bold leading-snug text-ink">{f.value}</div>
                </div>
              ))}
            </div>
          ) : null}

          {event.blurb ? (
            <div
              className="mb-5 text-[15.5px] font-medium leading-relaxed text-[#4a3a28]"
              // Blurbs contain trusted authored HTML (<br>, <b>, small <span>).
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: event.blurb }}
            />
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            {event.gmap_url ? (
              <a
                href={event.gmap_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-ocean px-3.5 py-1.5 text-[13px] font-extrabold text-white"
              >
                📍 Open in Maps
              </a>
            ) : null}
            {event.url ? (
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#e7d6ba] bg-white px-3.5 py-1.5 text-[13px] font-extrabold text-[#6a553c]"
              >
                🔗 More info
              </a>
            ) : null}
          </div>

          {event.reviews.length > 0 ? (
            <>
              <div className="mb-3 flex items-center gap-2.5 font-mono text-[13px] font-extrabold uppercase tracking-wide text-ink">
                What visitors say
              </div>
              <div className="flex flex-col gap-3">
                {event.reviews.map((r) => (
                  <div
                    key={r.id}
                    className="tp-review relative overflow-hidden rounded-xl border-[1.5px] border-[#e7d6ba] bg-white px-4 py-3.5"
                  >
                    <div className="mb-1.5 tracking-[2px] text-[15px] text-gold">{stars(r.stars)}</div>
                    <p className="m-0 mb-2 text-[14.5px] font-semibold italic leading-snug text-ink">{r.quote}</p>
                    {r.who ? <div className="font-mono text-[12.5px] font-extrabold opacity-70">{r.who}</div> : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
