import { useOnline } from '../hooks/useOnline';

export default function OfflineBanner(): JSX.Element | null {
  const online = useOnline();
  if (online) return null;
  return (
    <p className="mx-auto mb-4 max-w-[760px] rounded-lg bg-[#fdeecd] px-4 py-2 text-center text-[13px] font-bold text-[#8a6f4c]">
      Offline — showing saved data; changes can&rsquo;t be saved.
    </p>
  );
}
