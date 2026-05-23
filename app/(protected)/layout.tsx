import BottomNav from '@/app/components/BottomNav'
import InstallPrompt from '@/components/InstallPrompt'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <main className="flex-1 pb-20 overflow-y-auto">
        {children}
      </main>
      <BottomNav />
      <InstallPrompt />
    </div>
  )
}
