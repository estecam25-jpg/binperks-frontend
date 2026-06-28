import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/member/login')
  }

  // Check if this auth user owns a merchant account
  const { data: merchant } = await supabase
    .from('merchants')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (merchant) {
    redirect('/merchant/dashboard')
  }

  redirect('/member/dashboard')
}