'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }

    const dismissed = localStorage.getItem('installPromptDismissed')
    if (dismissed) {
      const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24)
      if (daysSince < 7) return
    }

    const ios = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
    setIsIOS(ios)

    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
      setIsVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    if (ios) {
      const timer = setTimeout(() => setIsVisible(true), 30000)
      return () => clearTimeout(timer)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'accepted') {
      setIsVisible(false)
      setIsInstalled(true)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    localStorage.setItem('installPromptDismissed', Date.now().toString())
  }

  if (!isVisible || isInstalled) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50">
      <div className="card-gradient border border-primary-container p-4 shadow-[0_0_20px_rgba(75,45,189,0.3)] relative">
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary opacity-50" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary opacity-50" />

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-container/20 border border-primary-container flex items-center justify-center flex-shrink-0">
            <span className="font-display text-[18px] font-bold text-primary">A</span>
          </div>

          <div className="flex-1">
            <div className="font-mono text-system-label text-secondary mb-1">INSTALL ASCEND</div>
            {isIOS ? (
              <p className="font-mono text-[10px] text-on-surface-variant leading-relaxed">
                Tap the share button then &quot;Add to Home Screen&quot; to install the system on your device.
              </p>
            ) : (
              <p className="font-mono text-[10px] text-on-surface-variant leading-relaxed">
                Install ASCEND on your device for the full system experience. Works offline.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          {!isIOS && (
            <button
              onClick={handleInstall}
              className="flex-1 h-10 bg-primary-container border border-[#6B3FD4] font-mono text-system-label text-on-primary-container uppercase tracking-widest hover:shadow-[0_0_10px_#6CCBFF] transition-all text-[10px]"
            >
              INSTALL NOW
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="px-4 h-10 border border-outline-variant font-mono text-system-label text-outline uppercase tracking-widest text-[10px] hover:border-outline transition-colors"
          >
            LATER
          </button>
        </div>
      </div>
    </div>
  )
}
