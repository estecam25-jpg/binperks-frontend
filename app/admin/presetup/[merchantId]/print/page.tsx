/**
 * /admin/presetup/[merchantId]/print — everything to print for one pre-setup store
 *
 * Server component behind the same allow-list as the dashboard, so a non-admin
 * never renders it at all.
 *
 * LAID OUT LIKE THE MERCHANT MARKETING TAB, on purpose: the two sections are
 * the ones that decide what the QR does, and seeing them apart is what stops
 * the register code (awards a stamp) going on a window (should not).
 *
 * EIGHT SEPARATE DOWNLOADS, NO COMBINED ONE. Each is built on demand from the
 * live artwork, and a single zip would have to be rebuilt whenever admin
 * replaced any one design. Plain anchors rather than fetch-and-blob: the
 * browser streams a 10-page PDF straight to disk, and a failure shows the
 * route's own JSON instead of a silent no-op.
 *
 * A material whose artwork admin has not uploaded is shown disabled with what
 * is missing named, rather than hidden — hiding it would leave someone
 * wondering whether they had forgotten to print something.
 */

import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'
import { isAdminEmail } from '@/lib/admin-emails'
import { CATEGORIES, specForMaterial, type MaterialRow } from '@/lib/marketing-materials'
import { joinUrlFor } from '@/lib/marketing-render'
import { PRESETUP } from '@/lib/presetup'

export const dynamic = 'force-dynamic'

export default async function PresetupPrintPage({
  params,
}: {
  params: Promise<{ merchantId: string }>
}) {
  const server = await createServerSupabaseClient()
  const { data: { user } } = await server.auth.getUser()
  if (!isAdminEmail(user?.email)) redirect('/admin/login')

  const { merchantId } = await params
  const admin = createAdminSupabaseClient()

  const [{ data: merchant }, { data: rows }, { data: templates }] = await Promise.all([
    admin.from('merchants')
      .select('id, company_name, owner_name, owner_email, billing_status')
      .eq('id', merchantId).maybeSingle(),
    admin.from('marketing_materials')
      .select('id, slug, category, title, description, render_recipe, template_slugs, ' +
              'lifestyle_image_path, download_format, display_order, active')
      .eq('active', true)
      .neq('category', 'social_media_post')
      .order('category', { ascending: true })
      .order('display_order', { ascending: true }),
    admin.from('marketing_templates').select('slug, storage_path'),
  ])

  if (!merchant || merchant.billing_status !== PRESETUP) notFound()

  const { data: store } = await admin
    .from('stores')
    .select('display_name, canonical_key, address, city, state, zip')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!store) notFound()

  const storeKey = store.canonical_key as string
  const materials = (rows ?? []) as unknown as MaterialRow[]
  const ready = new Set((templates ?? []).filter(r => r.storage_path).map(r => r.slug as string))

  const sections = CATEGORIES.filter(c => c.editable).map(cat => ({
    ...cat,
    items: materials.filter(m => m.category === cat.id).map(m => {
      const spec = specForMaterial(m)
      const missing = m.template_slugs.filter(t => !ready.has(t))
      return {
        slug: m.slug,
        title: m.title,
        description: m.description,
        output: (spec?.output ?? m.download_format).toUpperCase(),
        available: !!spec && missing.length === 0,
        missing,
      }
    }),
  }))

  const base = `/api/admin/presetup-stores/${merchantId}`

  return (
    <div className="min-h-screen bg-[#F5F5F8] px-4 py-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">

        <div>
          <Link href="/admin/dashboard" className="text-[12px] font-bold text-[#4A4B98] hover:underline">
            ← Back to admin
          </Link>
          <h1 className="font-['Coiny'] text-3xl text-[#1A1A2E] mt-2">
            Print materials
          </h1>
          <p className="text-[13px] text-[#8E8EA8] font-medium mt-1">
            {store.display_name as string} · {merchant.company_name as string}
          </p>
          <p className="text-[12px] text-[#8E8EA8] mt-0.5">
            Join link <span className="font-mono text-[#1A1A2E]">/join/{storeKey}</span>
          </p>
        </div>

        {sections.map(section => (
          <section key={section.id} className="flex flex-col gap-2.5">
            <div className="px-0.5">
              <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">{section.title}</h2>
              <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">{section.subtitle}</p>
            </div>

            {section.items.length === 0 && (
              <p className="text-[12px] text-[#8E8EA8] bg-white rounded-xl px-4 py-3">
                Nothing in this section yet.
              </p>
            )}

            {section.items.map(item => (
              <div key={item.slug}
                   className="bg-white rounded-2xl px-4 py-4 shadow-sm flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-[14px] text-[#1A1A2E]">{item.title}</p>
                  <p className="text-[11px] text-[#8E8EA8] font-medium leading-snug mt-0.5">
                    {item.description}
                  </p>
                  {!item.available && item.missing.length > 0 && (
                    <p className="text-[11px] text-[#DA1212] font-bold mt-1">
                      Artwork not uploaded: {item.missing.join(', ')}
                    </p>
                  )}
                </div>

                {item.available ? (
                  <a
                    href={`${base}/marketing/${item.slug}`}
                    className="shrink-0 bg-[#4A4B98] text-white text-[12px] font-bold tracking-wide
                               rounded-xl px-4 py-2.5 hover:bg-[#3A3B78] transition-colors"
                  >
                    Download {item.output}
                  </a>
                ) : (
                  <span className="shrink-0 bg-[#EBEBF2] text-[#8E8EA8] text-[12px] font-bold
                                   rounded-xl px-4 py-2.5 cursor-not-allowed">
                    Unavailable
                  </span>
                )}
              </div>
            ))}
          </section>
        ))}

        {/* ── The bare codes, for anything the six materials do not cover ── */}
        <section className="flex flex-col gap-2.5">
          <div className="px-0.5">
            <h2 className="font-['Coiny'] text-xl text-[#1A1A2E]">QR codes</h2>
            <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">
              The plain PNGs, 1000px, for artwork someone else is designing
            </p>
          </div>

          {([
            { target: 'register', title: 'Register QR', note: 'Awards 1 stamp on signup' },
            { target: 'social',   title: 'Social / signage QR', note: 'No stamp on signup' },
          ] as const).map(q => (
            <div key={q.target}
                 className="bg-white rounded-2xl px-4 py-4 shadow-sm flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-bold text-[14px] text-[#1A1A2E]">{q.title}</p>
                <p className="text-[11px] text-[#8E8EA8] font-medium mt-0.5">{q.note}</p>
                <p className="text-[10px] text-[#8E8EA8] font-mono mt-1 truncate">
                  {joinUrlFor(q.target, storeKey)}
                </p>
              </div>
              <a
                href={`${base}/qr/${q.target}`}
                className="shrink-0 bg-[#4A4B98] text-white text-[12px] font-bold tracking-wide
                           rounded-xl px-4 py-2.5 hover:bg-[#3A3B78] transition-colors"
              >
                Download PNG
              </a>
            </div>
          ))}
        </section>

      </div>
    </div>
  )
}
