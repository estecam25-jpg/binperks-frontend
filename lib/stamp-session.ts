export interface CashierSession {
  id: string
  name: string
  role: 'owner' | 'cashier'
  merchantId: string
  storeId: string
  pin: string  // plaintext as typed — sent to stamp route for server-side bcrypt re-verification
}

export interface StoreSession {
  id: string
  name: string
  storeKey: string
  brandColor: string
  logoUrl: string | null
  merchantId: string
}

export interface FoundMember {
  id: string
  firstName: string
  lastName: string
  phone: string
  totalStamps: number
  subscriptionStatus: 'free' | 'vip'
  couponDue: boolean
  couponValue: number
  isBlacklisted: boolean
  alreadyStampedToday: boolean
}

export interface StampResult {
  newTotalStamps: number
  couponIssued: boolean
  couponRedeemed: boolean
  couponValue: number
  memberFirstName: string
  memberLastName: string
  freeCouponExhausted: boolean
}

export interface RecentLookup {
  id: string
  firstName: string
  lastName: string
  formattedPhone: string
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function getItem<T>(key: string): T | null {
  if (!isBrowser()) return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function setItem<T>(key: string, value: T): void {
  if (!isBrowser()) return
  sessionStorage.setItem(key, JSON.stringify(value))
}

function removeItem(key: string): void {
  if (!isBrowser()) return
  sessionStorage.removeItem(key)
}

export const cashierSession = {
  get: () => getItem<CashierSession>('bp_cashier'),
  set: (v: CashierSession) => setItem('bp_cashier', v),
  clear: () => removeItem('bp_cashier'),
}

export const storeSession = {
  get: () => getItem<StoreSession>('bp_store'),
  set: (v: StoreSession) => setItem('bp_store', v),
  clear: () => removeItem('bp_store'),
}

export const foundMemberSession = {
  get: () => getItem<FoundMember>('bp_found_member'),
  set: (v: FoundMember) => setItem('bp_found_member', v),
  clear: () => removeItem('bp_found_member'),
}

export const stampResultSession = {
  get: () => getItem<StampResult>('bp_stamp_result'),
  set: (v: StampResult) => setItem('bp_stamp_result', v),
  clear: () => removeItem('bp_stamp_result'),
}

export const recentLookups = {
  get: (): RecentLookup[] => getItem<RecentLookup[]>('bp_recent') ?? [],
  add: (entry: RecentLookup) => {
    const current = recentLookups.get().filter(r => r.id !== entry.id)
    setItem('bp_recent', [entry, ...current].slice(0, 5))
  },
  clear: () => removeItem('bp_recent'),
}

export function signOutCashier(): void {
  cashierSession.clear()
  foundMemberSession.clear()
  stampResultSession.clear()
  recentLookups.clear()
}
