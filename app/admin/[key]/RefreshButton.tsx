'use client'

import { useRouter } from 'next/navigation'

export default function RefreshButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.refresh()}
      className="flex items-center gap-2 border border-outline-variant px-4 py-2 font-mono text-system-label text-outline hover:text-on-surface hover:border-outline transition-colors"
    >
      <span className="material-symbols-outlined text-[16px]">refresh</span>
      REFRESH DATA
    </button>
  )
}
