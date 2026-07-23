import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminSupabaseClient } from '@/lib/supabase-admin'

export async function GET() {
  const server = await createServerSupabaseClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: merchant } = await admin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: w9 } = await admin
    .from('merchant_w9')
    .select('status, submitted_at')
    .eq('merchant_id', merchant.id)
    .single()

  return NextResponse.json({ w9: w9 ?? null })
}

export async function POST(req: Request) {
  const server = await createServerSupabaseClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data: merchant } = await admin
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!merchant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const pdfPath = merchant.id + '/w9.pdf'

  const { error: uploadError } = await admin.storage
    .from('merchant-w9')
    .upload(pdfPath, bytes, { contentType: 'application/pdf', upsert: true })

  if (uploadError) {
    console.error('[w9] storage upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { error: dbError } = await admin
    .from('merchant_w9')
    .upsert({
      merchant_id:  merchant.id,
      pdf_path:     pdfPath,
      status:       'pending',
      submitted_at: now,
      reviewed_at:  null,          // reset on re-upload
      updated_at:   now,
    }, { onConflict: 'merchant_id' })

  if (dbError) {
    console.error('[w9] db upsert error:', dbError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
