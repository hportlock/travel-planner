import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  DayWithItems,
  EventWithReviews,
  ItineraryWithDays,
  LayoutConfig,
  TripDetail,
} from '@travel-plan/shared';
import { DAY_STYLES } from '@travel-plan/shared';
import { ApiError, api, createShare, getTrip } from '../api/client';
import { CenterMessage, TripBody } from './ShareView';

export default function TripEdit(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const t = await getTrip(id);
      setTrip(t);
      setError(null);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 401) {
        navigate('/login');
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to load trip');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        await reload();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  if (loading) return <CenterMessage>Loading trip…</CenterMessage>;
  if (error && !trip) return <CenterMessage>{error}</CenterMessage>;
  if (!trip) return <CenterMessage>Trip not found.</CenterMessage>;

  const toolbar = (
    <EditorPanel
      trip={trip}
      busy={busy}
      error={error}
      shareUrl={shareUrl}
      onShare={() =>
        void run(async () => {
          const res = await createShare(trip.id);
          setShareUrl(res.url);
        })
      }
      run={run}
    />
  );

  return <TripBody trip={trip} toolbar={toolbar} />;
}

interface EditorPanelProps {
  trip: TripDetail;
  busy: boolean;
  error: string | null;
  shareUrl: string | null;
  onShare: () => void;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}

function EditorPanel({ trip, busy, error, shareUrl, onShare, run }: EditorPanelProps): JSX.Element {
  const [title, setTitle] = useState(trip.title);
  const [subtitle, setSubtitle] = useState(trip.subtitle);
  const layout: LayoutConfig | null = trip.theme?.layout ?? null;
  const [dayStyle, setDayStyle] = useState<LayoutConfig['dayStyle']>(layout?.dayStyle ?? 'cards');
  const [customCss, setCustomCss] = useState(trip.theme?.custom_css ?? '');

  const selectedItinerary: ItineraryWithDays | null = trip.activeItinerary ?? trip.itineraries[0] ?? null;

  return (
    <div className="mx-auto mb-6 max-w-[760px] rounded-card border-2 border-dashed border-[#e7d6ba] bg-[#fffdf8] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-[15px] font-extrabold uppercase tracking-wide text-[#8a6f4c]">
          Owner tools {busy ? '· saving…' : ''}
        </h2>
        <button
          type="button"
          onClick={onShare}
          disabled={busy}
          className="rounded-full bg-ocean px-3.5 py-1.5 text-[13px] font-extrabold text-white disabled:opacity-50"
        >
          Share link
        </button>
      </div>

      {error ? <p className="mb-3 text-[13px] font-bold text-ember">{error}</p> : null}
      {shareUrl ? (
        <p className="mb-3 break-all rounded-lg bg-[#dff3e6] px-3 py-2 font-mono text-[12px] text-[#1f7a47]">
          {shareUrl}
        </p>
      ) : null}

      {/* Trip details */}
      <fieldset className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <LabeledInput label="Title" value={title} onChange={setTitle} />
        <LabeledInput label="Subtitle" value={subtitle} onChange={setSubtitle} />
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.patch(`/api/trips/${trip.id}`, { title, subtitle }))}
          className="self-end rounded-full bg-coral px-4 py-2 text-[13px] font-extrabold text-white disabled:opacity-50"
        >
          Save trip details
        </button>
      </fieldset>

      {/* Add event */}
      <AddEventForm trip={trip} busy={busy} run={run} />

      {/* Itinerary editing */}
      {selectedItinerary ? (
        <ItineraryEditor itinerary={selectedItinerary} events={trip.events} busy={busy} run={run} />
      ) : (
        <p className="mb-4 text-[13px] font-semibold text-[#8a6f4c]">
          No itinerary yet — create one via the API to start adding days.
        </p>
      )}

      {/* Theming */}
      <fieldset className="border-t border-dashed border-[#e7d6ba] pt-3">
        <legend className="font-display text-[13px] font-extrabold uppercase tracking-wide text-[#8a6f4c]">
          Theming
        </legend>
        <label className="mt-2 block text-[12px] font-bold text-[#6a553c]">
          Day style
          <select
            value={dayStyle}
            onChange={(e) => setDayStyle(e.target.value as LayoutConfig['dayStyle'])}
            className="ml-2 rounded border border-[#e7d6ba] bg-white px-2 py-1 font-mono text-[12px]"
          >
            {DAY_STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <textarea
          value={customCss}
          onChange={(e) => setCustomCss(e.target.value)}
          placeholder="#trip-root .tp-hero { ... }  /* custom_css, scoped under #trip-root */"
          rows={5}
          className="mt-2 w-full rounded-lg border border-[#e7d6ba] bg-white p-2 font-mono text-[12px]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() =>
              api.patch(`/api/trips/${trip.id}/themes`, {
                custom_css: customCss,
                layout: { ...(layout ?? {}), dayStyle },
              }),
            )
          }
          className="mt-2 rounded-full bg-coral px-4 py-2 text-[13px] font-extrabold text-white disabled:opacity-50"
        >
          Save theme
        </button>
      </fieldset>
    </div>
  );
}

function AddEventForm({
  trip,
  busy,
  run,
}: {
  trip: TripDetail;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}): JSX.Element {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');

  const submit = () => {
    if (!slug || !name) return;
    void run(async () => {
      await api.post(`/api/trips/${trip.id}/events`, { slug, name, emoji });
      setSlug('');
      setName('');
      setEmoji('');
    });
  };

  return (
    <fieldset className="mb-4 border-t border-dashed border-[#e7d6ba] pt-3">
      <legend className="font-display text-[13px] font-extrabold uppercase tracking-wide text-[#8a6f4c]">
        Add activity
      </legend>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <LabeledInput label="Slug (snake_case)" value={slug} onChange={setSlug} />
        <LabeledInput label="Name" value={name} onChange={setName} />
        <LabeledInput label="Emoji" value={emoji} onChange={setEmoji} />
      </div>
      <button
        type="button"
        disabled={busy || !slug || !name}
        onClick={submit}
        className="mt-2 rounded-full bg-coral px-4 py-2 text-[13px] font-extrabold text-white disabled:opacity-50"
      >
        Add activity
      </button>
    </fieldset>
  );
}

function ItineraryEditor({
  itinerary,
  events,
  busy,
  run,
}: {
  itinerary: ItineraryWithDays;
  events: EventWithReviews[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}): JSX.Element {
  return (
    <fieldset className="mb-4 border-t border-dashed border-[#e7d6ba] pt-3">
      <div className="flex items-center justify-between">
        <legend className="font-display text-[13px] font-extrabold uppercase tracking-wide text-[#8a6f4c]">
          Days · {itinerary.name}
        </legend>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => api.post(`/api/itineraries/${itinerary.id}/days`, { dow: 'New day' }))}
          className="rounded-full border-2 border-[#e7d6ba] bg-white px-3 py-1 text-[12px] font-extrabold text-[#6a553c] disabled:opacity-50"
        >
          + Add day
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        {itinerary.days.map((day) => (
          <DayEditor key={day.id} day={day} events={events} busy={busy} run={run} />
        ))}
      </div>
    </fieldset>
  );
}

function DayEditor({
  day,
  events,
  busy,
  run,
}: {
  day: DayWithItems;
  events: EventWithReviews[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}): JSX.Element {
  const [eventId, setEventId] = useState(events[0]?.id ?? '');

  const move = (index: number, dir: -1 | 1) => {
    const ids = day.items.map((i) => i.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => api.post(`/api/days/${day.id}/reorder`, { itemIds: ids }));
  };

  return (
    <div className="rounded-lg border border-[#e7d6ba] bg-white p-3">
      <div className="mb-2 font-display text-[14px] font-extrabold text-ink">
        {day.dow || 'Day'} {day.date_label ? `· ${day.date_label}` : ''}
      </div>

      <ul className="mb-2 flex flex-col gap-1">
        {day.items.map((item, idx) => {
          const ev = events.find((e) => e.id === item.event_id);
          return (
            <li key={item.id} className="flex items-center gap-2 text-[13px]">
              <span className="flex-1 truncate font-semibold text-ink">
                {ev?.emoji} {ev?.name ?? item.event_id}
              </span>
              <button
                type="button"
                disabled={busy || idx === 0}
                onClick={() => move(idx, -1)}
                className="rounded border border-[#e7d6ba] px-1.5 text-[12px] font-bold disabled:opacity-30"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || idx === day.items.length - 1}
                onClick={() => move(idx, 1)}
                className="rounded border border-[#e7d6ba] px-1.5 text-[12px] font-bold disabled:opacity-30"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => api.del(`/api/day-items/${item.id}`))}
                className="rounded border border-[#e7d6ba] px-1.5 text-[12px] font-bold text-ember disabled:opacity-30"
                aria-label="Remove"
              >
                ×
              </button>
            </li>
          );
        })}
        {day.items.length === 0 ? (
          <li className="text-[12px] italic text-[#8a6f4c]">No items yet.</li>
        ) : null}
      </ul>

      <div className="flex items-center gap-2">
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="flex-1 rounded border border-[#e7d6ba] bg-white px-2 py-1 text-[12px]"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.emoji} {e.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !eventId}
          onClick={() => void run(() => api.post(`/api/days/${day.id}/items`, { event_id: eventId }))}
          className="rounded-full bg-coral px-3 py-1 text-[12px] font-extrabold text-white disabled:opacity-50"
        >
          + Item
        </button>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label className="block text-[11px] font-extrabold uppercase tracking-wide text-[#9a7f5c]">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[#e7d6ba] bg-white px-2.5 py-1.5 text-[14px] font-semibold normal-case text-ink"
      />
    </label>
  );
}
