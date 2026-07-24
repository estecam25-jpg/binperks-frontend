'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import MerchantNav, { type TabId, type Store } from './components/MerchantNav'
import OverviewTab from './components/tabs/OverviewTab'
import MembersTab from './components/tabs/MembersTab'
import { RedemptionsTab, PerksTab, MarketingTab, SettingsTab, GettingStartedTab } from './components/tabs/DashboardTabs'

function DashboardShell() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [companyName, setCompanyName] = useState('')
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [onboardingPct, setOnboardingPct] = useState(100)
  const [abandonedCheckout, setAbandonedCheckout] = useState(false)
  const [resuming, setResuming] = useState(false)

  // Tab and store from URL params — enables deep linking + back button
  const activeTab = (searchParams.get('tab') as TabId) || 'overview'
  const activeStoreId = searchParams.get('store') || null  // null = all locations

  function setTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/merchant/dashboard?${params}`)
  }

  function setStore(storeId: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (storeId) params.set('store', storeId)
    else params.delete('store')
    router.replace(`/merchant/dashboard?${params}`)
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/merchant/dashboard').then(res => {
        if (res.status === 401) { router.replace('/merchant/login'); return null }
        return res.json()
      }),
      fetch('/api/merchant/onboarding').then(r => r.ok ? r.json() : null),
    ]).then(([data, onboarding]) => {
      if (!data) return
      setCompanyName(data.merchant?.companyName ?? '')
      setStores(data.stores ?? [])
      if (onboarding) setOnboardingPct(Math.round((onboarding.completedCount / onboarding.total) * 100))
      const isPending = data.merchant?.billingStatus === 'pending' && !data.merchant?.hasSubscription
      setAbandonedCheckout(isPending)
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return (
      <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
        <div className="h-[88px] bg-[#1A1A2E] animate-pulse" />
        <div className="flex-1 flex items-center justify-center">
          <span className="w-8 h-8 border-[3px] border-[#EBEBF2] border-t-[#FFB217] rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  async function handleResumeCheckout() {
    setResuming(true)
    const res = await fetch('/api/merchant/resume-checkout', { method: 'POST' })
    if (res.ok) {
      const d = await res.json()
      window.location.href = d.url
    } else {
      setResuming(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
      {abandonedCheckout && (
        <div className="bg-amber-50 border-b-2 border-amber-300 px-5 py-4 flex flex-col gap-2.5">
          <div className="flex items-start gap-3">
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-[#1A1A2E] leading-tight">
                Complete your BinPerks subscription to get started.
              </p>
              <p className="text-[13px] text-[#8E8EA8] font-medium mt-0.5">
                Your account is set up but payment wasn&apos;t completed.
              </p>
            </div>
          </div>
          <button
            onClick={handleResumeCheckout}
            disabled={resuming}
            className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white bg-[#4A4B98] disabled:opacity-60 active:scale-[0.98] transition-all"
          >
            {resuming ? 'Redirecting…' : 'Complete Payment →'}
          </button>
        </div>
      )}
      <MerchantNav
        companyName={companyName}
        stores={stores}
        activeStoreId={activeStoreId}
        activeTab={activeTab}
        onStoreChange={setStore}
        onTabChange={setTab}
        showStart={onboardingPct < 100}
      />

      <div className="flex-1 max-w-2xl mx-auto w-full">
        {activeTab === 'start' && (
          <GettingStartedTab storeId={activeStoreId} />
        )}
        {activeTab === 'overview' && (
          <OverviewTab storeId={activeStoreId} />
        )}
        {activeTab === 'members' && (
          <MembersTab storeId={activeStoreId} />
        )}
        {activeTab === 'redemptions' && (
          <RedemptionsTab storeId={activeStoreId} />
        )}
        {activeTab === 'perks' && (
          <PerksTab storeId={activeStoreId} stores={stores} />
        )}
        {activeTab === 'marketing' && (
          <MarketingTab storeId={activeStoreId} stores={stores} />
        )}
        {activeTab === 'settings' && (
          <SettingsTab storeId={activeStoreId} stores={stores} />
        )}
      </div>
    </div>
  )
}

export default function MerchantDashboardPage() {
  return (
    <Suspense>
      <DashboardShell />
    </Suspense>
  )
}
