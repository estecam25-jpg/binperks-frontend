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
      if (onboarding) setOnboardingPct(Math.round((onboarding.completedCount / 13) * 100))
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

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F5F8]">
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
