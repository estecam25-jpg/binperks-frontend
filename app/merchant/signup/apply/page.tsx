'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { merchantSignupForm, type MerchantSignupForm } from '@/lib/merchant-signup-session'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]

type FormErrors = Partial<Record<keyof MerchantSignupForm, string>>

function validate(f: MerchantSignupForm): FormErrors {
  const e: FormErrors = {}
  if (!f.firstName.trim())   e.firstName = 'Required'
  if (!f.lastName.trim())    e.lastName  = 'Required'
  if (!f.email.includes('@')) e.email    = 'Enter a valid email'
  if (!f.companyName.trim()) e.companyName = 'Required — enter your LLC or business name'
  if (!f.storeName.trim())   e.storeName = 'Required — enter the name of this location'
  if (!f.city.trim())        e.city      = 'Required'
  if (!f.state)              e.state     = 'Required'
  if (!f.zip.trim())         e.zip       = 'Required'
  if (!f.locationCount || f.locationCount < 1) e.locationCount = 'Required'
  if (!f.binCount || f.binCount < 1) e.binCount = 'Required — enter the number of bins'
  return e
}

function Field({
  label, hint, error, children,
}: {
  label: string; hint?: string; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-bold tracking-[0.06em] uppercase text-[#8E8EA8]">
        {label}
      </label>
      {hint && <p className="text-[11px] text-[#8E8EA8] font-medium -mt-0.5">{hint}</p>}
      {children}
      {error && <p className="text-[11px] font-semibold text-[#DA1212]">{error}</p>}
    </div>
  )
}

const inputClass = (hasError: boolean) => `
  w-full px-4 py-3.5 rounded-xl border-2 font-['Montserrat'] text-[15px] font-semibold
  text-[#1A1A2E] bg-[#F5F5F8] outline-none transition-colors
  placeholder:text-[#D1D1DC] placeholder:font-normal
  focus:bg-white focus:border-[#4A4B98]
  ${hasError ? 'border-[#DA1212] bg-red-50 focus:border-[#DA1212]' : 'border-transparent'}
`

const selectClass = (hasError: boolean) => `
  w-full px-4 py-3.5 rounded-xl border-2 font-['Montserrat'] text-[15px] font-semibold
  text-[#1A1A2E] bg-[#F5F5F8] outline-none transition-colors appearance-none
  focus:bg-white focus:border-[#4A4B98]
  ${hasError ? 'border-[#DA1212] bg-red-50' : 'border-transparent'}
`

export default function MerchantApplyPage() {
  const router = useRouter()
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState<MerchantSignupForm>({
    firstName: '', lastName: '', email: '', phone: '', website: '',
    companyName: '',
    storeName: '', address: '', city: '', state: '', zip: '', country: 'US',
    locationCount: 1,
    binCount: 0,
  })

  useEffect(() => {
    const saved = merchantSignupForm.get()
    if (saved) setForm(saved)
  }, [])

  function update(field: keyof MerchantSignupForm, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function touch(field: string) {
    setTouched(prev => new Set([...prev, field]))
  }

  function err(field: keyof MerchantSignupForm) {
    return touched.has(field) ? errors[field] : undefined
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const allFields = Object.keys(form) as (keyof MerchantSignupForm)[]
    setTouched(new Set(allFields.map(String)))
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    merchantSignupForm.set(form)
    router.push('/merchant/signup/plan')
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">

      <div className="bg-[#1A1A2E] px-5 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/merchant/signup')}
          className="text-white/60 text-[22px] leading-none" aria-label="Back">←</button>
        <span className="font-['Coiny'] text-xl text-white leading-none">Apply for BinPerks</span>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-8 pb-16 max-w-lg mx-auto w-full">
        <form onSubmit={handleSubmit} noValidate className="w-full flex flex-col gap-8">

          {/* Section 1: Your Info */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-[#4A4B98] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">1</div>
              <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Your info</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" error={err('firstName')}>
                <input type="text" placeholder="Jane" value={form.firstName}
                  onChange={e => update('firstName', e.target.value)}
                  onBlur={() => touch('firstName')}
                  autoComplete="given-name"
                  className={inputClass(!!err('firstName'))} />
              </Field>
              <Field label="Last name" error={err('lastName')}>
                <input type="text" placeholder="Smith" value={form.lastName}
                  onChange={e => update('lastName', e.target.value)}
                  onBlur={() => touch('lastName')}
                  autoComplete="family-name"
                  className={inputClass(!!err('lastName'))} />
              </Field>
            </div>

            <Field label="Email address" error={err('email')}>
              <input type="email" inputMode="email" placeholder="jane@mybinstore.com"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                onBlur={() => touch('email')}
                autoComplete="email"
                className={inputClass(!!err('email'))} />
            </Field>

            <Field label="Phone" hint="For BinPerks onboarding calls only">
              <input type="tel" inputMode="tel" placeholder="(555) 000-0000"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                autoComplete="tel"
                className={inputClass(false)} />
            </Field>

            <Field label="Website" hint="Optional">
              <input type="url" placeholder="https://mybinstore.com"
                value={form.website}
                onChange={e => update('website', e.target.value)}
                className={inputClass(false)} />
            </Field>
          </section>

          <div className="border-t border-[#EBEBF2]" />

          {/* Section 2: Your Business */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-[#4A4B98] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">2</div>
              <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">Your business</h2>
            </div>

            <Field
              label="Legal Business Name"
              hint="Enter your LLC, Corp, or sole proprietor legal name exactly as registered (e.g. 'Acme Bins LLC')"
              error={err('companyName')}
            >
              <input type="text" placeholder="XYZ Liquidation LLC"
                value={form.companyName}
                onChange={e => update('companyName', e.target.value)}
                onBlur={() => touch('companyName')}
                className={inputClass(!!err('companyName'))} />
            </Field>

            <Field
              label="How many locations total?"
              hint="You can add more later at +$79.99/mo each"
              error={err('locationCount')}
            >
              <select
                value={form.locationCount}
                onChange={e => update('locationCount', Number(e.target.value))}
                onBlur={() => touch('locationCount')}
                className={selectClass(!!err('locationCount'))}
              >
                {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{n} location{n > 1 ? 's' : ''}</option>
                ))}
              </select>
            </Field>
          </section>

          <div className="border-t border-[#EBEBF2]" />

          {/* Section 3: First Location */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-[#4A4B98] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">3</div>
              <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">First store location</h2>
            </div>

            <Field
              label="Store Name (DBA)"
              hint="The name your customers know you by (e.g. 'Deal Daze')"
              error={err('storeName')}
            >
              <input type="text" placeholder="Acme Bins Prosperous"
                value={form.storeName}
                onChange={e => update('storeName', e.target.value)}
                onBlur={() => touch('storeName')}
                className={inputClass(!!err('storeName'))} />
            </Field>

            <Field
              label="Number of Bins"
              hint="How many bins does this location have? (e.g. 200)"
              error={err('binCount')}
            >
              <input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 150"
                min={1}
                value={form.binCount || ''}
                onChange={e => update('binCount', Number(e.target.value))}
                onBlur={() => touch('binCount')}
                className={inputClass(!!err('binCount'))}
              />
            </Field>

            <Field label="Street address">
              <input type="text" placeholder="123 Bargain Blvd"
                value={form.address}
                onChange={e => update('address', e.target.value)}
                autoComplete="street-address"
                className={inputClass(false)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="City" error={err('city')}>
                <input type="text" placeholder="Prosperous"
                  value={form.city}
                  onChange={e => update('city', e.target.value)}
                  onBlur={() => touch('city')}
                  autoComplete="address-level2"
                  className={inputClass(!!err('city'))} />
              </Field>
              <Field label="State" error={err('state')}>
                <select value={form.state}
                  onChange={e => update('state', e.target.value)}
                  onBlur={() => touch('state')}
                  className={selectClass(!!err('state'))}>
                  <option value="">State</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            <Field label="ZIP code" error={err('zip')}>
              <input type="text" inputMode="numeric" placeholder="33801"
                value={form.zip}
                onChange={e => update('zip', e.target.value)}
                onBlur={() => touch('zip')}
                autoComplete="postal-code"
                maxLength={5}
                className={inputClass(!!err('zip'))} />
            </Field>
          </section>

          {/* Legal notice */}
          <p className="text-[11px] text-[#8E8EA8] font-medium text-center leading-relaxed">
            By submitting this application you agree to our{' '}
            <a href="/terms/merchant" target="_blank" rel="noopener noreferrer" className="text-[#4A4B98] font-semibold underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/terms/privacy" target="_blank" rel="noopener noreferrer" className="text-[#4A4B98] font-semibold underline">Privacy Policy</a>.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-5 rounded-2xl font-bold text-[17px] text-white font-['Montserrat'] bg-[#4A4B98] disabled:opacity-50 active:scale-[0.97] transition-all tracking-wide"
          >
            Review My Plan →
          </button>

          <p className="text-[11px] text-[#8E8EA8] text-center font-medium -mt-3">
            Payment is next. No charges until you confirm.
          </p>
        </form>
      </main>
    </div>
  )
}