import { BottomNav, TopNav } from '@/components/nav'
import { authedDb } from '@/server/session'
import { getSettings } from '@/server/settings'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings(await authedDb())
  return (
    <>
      <TopNav businessName={settings.businessName} />
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-28 md:pb-12">{children}</main>
      <BottomNav />
    </>
  )
}
