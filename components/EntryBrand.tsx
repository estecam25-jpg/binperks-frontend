/**
 * The BinPerks entry mark — red circle logo on BinPerks blue.
 *
 * Used on every DOOR into the product: member sign-in/join, merchant login and
 * signup, the cashier store picker, and admin login. One component so those
 * five pages cannot drift into five slightly different front doors.
 *
 * The circle mark belongs on entry pages; the LANDSCAPE wordmark belongs
 * inside the app (AppHeader, the stamp tool once a store is chosen). Keeping
 * that split is the whole point of this file existing.
 *
 * icon.png is the same asset the PWA installs as, and its corners are
 * genuinely transparent — the red is the logo itself, not a backdrop.
 */

export default function EntryBrand({
  subtitle,
  size = 'md',
}: {
  subtitle?: string
  /** 'lg' for pages whose entire job is the door; 'md' where a form follows. */
  size?: 'md' | 'lg'
}) {
  const px = size === 'lg' ? 'h-28 w-28' : 'h-20 w-20'

  return (
    <div
      className="w-full flex flex-col items-center px-5 pt-12 pb-10 gap-3"
      style={{ backgroundColor: '#4A4B98' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.png"
        alt="BinPerks"
        className={`${px} object-contain`}
      />
      {subtitle && (
        <p className="text-white/70 text-[14px] font-semibold text-center">{subtitle}</p>
      )}
    </div>
  )
}
