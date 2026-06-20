import type { ItineraryWithDays } from '@travel-plan/shared';

interface VariantSwitchProps {
  itineraries: ItineraryWithDays[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function VariantSwitch({
  itineraries,
  selectedId,
  onSelect,
}: VariantSwitchProps): JSX.Element | null {
  if (itineraries.length <= 1) return null;

  return (
    <div
      className="tp-variant-switch mx-auto mb-6 flex max-w-[760px] flex-wrap gap-2.5"
      role="tablist"
      aria-label="Itinerary options"
    >
      {itineraries.map((it) => {
        const active = it.id === selectedId;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(it.id)}
            className={[
              'min-w-[140px] flex-1 cursor-pointer rounded-xl border-2 px-3.5 py-3 text-left transition',
              active
                ? 'border-ember bg-[#fff7ef] shadow-[0_5px_0_var(--ember)]'
                : 'border-[#e7d6ba] bg-white shadow-[0_5px_0_#e7d6ba] hover:-translate-y-0.5',
            ].join(' ')}
          >
            <div className={['font-display text-[17px] font-extrabold leading-tight', active ? 'text-ember' : 'text-ink'].join(' ')}>
              {it.name}
            </div>
            {it.vibe ? (
              <div className="mt-0.5 text-[12.5px] font-semibold leading-snug text-[#9a7f5c]">{it.vibe}</div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
