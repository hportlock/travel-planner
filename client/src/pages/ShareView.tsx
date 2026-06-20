import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type {
  EventWithReviews,
  ItineraryWithDays,
  LayoutConfig,
  TripDetail,
} from '@travel-plan/shared';
import { SECTION_KEYS } from '@travel-plan/shared';
import { getShared } from '../api/client';
import ThemeProvider from '../theme/ThemeProvider';
import Hero from '../components/Hero';
import VariantSwitch from '../components/VariantSwitch';
import DayCard from '../components/DayCard';
import DetailSheet from '../components/DetailSheet';
import LodgingCard from '../components/LodgingCard';
import RegionLegend from '../components/RegionLegend';

type SectionKey = (typeof SECTION_KEYS)[number];

export default function ShareView(): JSX.Element {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shareToken) return;
    let active = true;
    setLoading(true);
    getShared(shareToken)
      .then((t) => {
        if (active) {
          setTrip(t);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load trip');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shareToken]);

  if (loading) return <CenterMessage>Loading trip…</CenterMessage>;
  if (error || !trip) return <CenterMessage>{error ?? 'Trip not found.'}</CenterMessage>;

  return <TripBody trip={trip} />;
}

export function CenterMessage({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center font-semibold text-[#8a6f4c]">
      {children}
    </div>
  );
}

interface TripBodyProps {
  trip: TripDetail;
  /** Optional slot rendered just under the hero (used by the owner editor). */
  toolbar?: ReactNode;
}

/** Shared read rendering used by both ShareView and TripEdit. */
export function TripBody({ trip, toolbar }: TripBodyProps): JSX.Element {
  const [openEvent, setOpenEvent] = useState<EventWithReviews | null>(null);
  const [selectedItineraryId, setSelectedItineraryId] = useState<string | null>(
    trip.activeItinerary?.id ?? trip.itineraries[0]?.id ?? null,
  );

  const eventsById = useMemo(
    () => new Map(trip.events.map((e) => [e.id, e])),
    [trip.events],
  );

  const selected: ItineraryWithDays | null = useMemo(() => {
    return (
      trip.itineraries.find((it) => it.id === selectedItineraryId) ??
      trip.activeItinerary ??
      trip.itineraries[0] ??
      null
    );
  }, [trip, selectedItineraryId]);

  const layout: LayoutConfig | null = trip.theme?.layout ?? null;
  const dayStyle = layout?.dayStyle ?? 'cards';
  const showRegionColors = layout?.showRegionColors ?? true;

  const order: SectionKey[] = layout?.sectionOrder?.length ? layout.sectionOrder : [...SECTION_KEYS];
  const visibility = layout?.sectionVisibility ?? {};
  const isVisible = (k: SectionKey): boolean => visibility[k] !== false;

  const eventsWithCoords = trip.events.filter((e) => e.lat != null && e.lng != null);

  const renderSection = (key: SectionKey): JSX.Element | null => {
    if (!isVisible(key)) return null;
    switch (key) {
      case 'hero':
        return (
          <section key="hero" className="tp-section">
            <Hero trip={trip} />
            {toolbar}
            <RegionLegend regions={trip.regions} />
            <VariantSwitch
              itineraries={trip.itineraries}
              selectedId={selected?.id ?? ''}
              onSelect={setSelectedItineraryId}
            />
          </section>
        );
      case 'itinerary':
        return (
          <section key="itinerary" className="tp-section mx-auto max-w-[760px]">
            {selected ? (
              selected.days.map((day) => (
                <DayCard
                  key={day.id}
                  day={day}
                  eventsById={eventsById}
                  regions={trip.regions}
                  dayStyle={dayStyle}
                  showRegionColors={showRegionColors}
                  onOpen={setOpenEvent}
                />
              ))
            ) : (
              <p className="text-center font-semibold text-[#8a6f4c]">No itinerary yet.</p>
            )}
          </section>
        );
      case 'catalog':
        return (
          <section key="catalog" className="tp-section mx-auto mt-8 max-w-[760px]">
            <SectionTitle>All activities</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {trip.events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setOpenEvent(e)}
                  className="tp-activity flex items-center gap-3 rounded-card border-2 border-[#e7d6ba] bg-white px-4 py-3 text-left shadow-[0_6px_0_#efe1c8] transition hover:-translate-y-0.5"
                  data-region={e.region || undefined}
                  data-tag={e.tags[0] ?? undefined}
                >
                  <span className="tp-activity-emoji text-[26px]">{e.emoji || '📍'}</span>
                  <span className="tp-activity-name font-display text-[15px] font-extrabold text-ink">
                    {e.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      case 'lodging':
        if (trip.lodging.length === 0) return null;
        return (
          <section key="lodging" className="tp-section mx-auto mt-8 max-w-[760px]">
            <SectionTitle>Where you're staying</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {trip.lodging.map((l) => (
                <LodgingCard key={l.id} lodging={l} />
              ))}
            </div>
          </section>
        );
      case 'map':
        if (eventsWithCoords.length === 0) return null;
        return (
          <section key="map" className="tp-section mx-auto mt-8 max-w-[760px]">
            <SectionTitle>On the map</SectionTitle>
            <ul className="flex flex-col gap-2">
              {eventsWithCoords.map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded-xl border-2 border-[#e7d6ba] bg-white px-4 py-2.5">
                  <span className="text-[20px]">{e.emoji || '📍'}</span>
                  <span className="flex-1 font-semibold text-ink">{e.name}</span>
                  {e.gmap_url ? (
                    <a href={e.gmap_url} target="_blank" rel="noreferrer" className="font-mono text-[12px] font-bold text-ocean">
                      {e.lat?.toFixed(3)}, {e.lng?.toFixed(3)}
                    </a>
                  ) : (
                    <span className="font-mono text-[12px] text-[#8a6f4c]">
                      {e.lat?.toFixed(3)}, {e.lng?.toFixed(3)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      default:
        return null;
    }
  };

  return (
    <ThemeProvider theme={trip.theme}>
      <div className="mx-auto w-full px-3 pb-16 pt-4">
        {order.map((k) => renderSection(k))}
      </div>
      <DetailSheet event={openEvent} regions={trip.regions} onClose={() => setOpenEvent(null)} />
    </ThemeProvider>
  );
}

function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
  return (
    <h2 className="mb-3 font-display text-[20px] font-extrabold text-ink">{children}</h2>
  );
}
