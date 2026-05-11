import type { Archetype, Rank, QuestDifficulty } from './types'

export function assignArchetype(struggle: string, killer: string): Archetype {
  if (struggle === 'consistency' && killer === 'badday') return 'Dormant Titan'
  if (struggle === 'consistency' && killer === 'fade') return 'Dormant Titan'
  if (struggle === 'direction' && killer === 'structure') return 'Lost Hunter'
  if (struggle === 'direction' && killer === 'overthink') return 'Overthinker Rogue'
  if (struggle === 'distraction' && killer === 'phone') return 'Broken Mage'
  if (struggle === 'confidence' && killer === 'badday') return 'Silent Warrior'
  if (struggle === 'confidence' && killer === 'overthink') return 'Silent Warrior'
  if (struggle === 'energy' && killer === 'fade') return 'Iron Ghost'
  if (struggle === 'scattered' && killer === 'overthink') return 'Overthinker Rogue'
  return 'Dormant Titan'
}

export function getBaselineStats(archetype: Archetype) {
  const map: Record<Archetype, Record<string, number>> = {
    'Silent Warrior': {
      strength: 30, focus: 25, discipline: 20, confidence: 10,
      intelligence: 25, purpose: 20, energy: 25,
    },
    'Dormant Titan': {
      strength: 25, focus: 20, discipline: 10, confidence: 20,
      intelligence: 20, purpose: 25, energy: 20,
    },
    'Lost Hunter': {
      strength: 20, focus: 20, discipline: 20, confidence: 20,
      intelligence: 25, purpose: 10, energy: 25,
    },
    'Broken Mage': {
      strength: 20, focus: 10, discipline: 15, confidence: 20,
      intelligence: 35, purpose: 20, energy: 20,
    },
    'Overthinker Rogue': {
      strength: 20, focus: 20, discipline: 20, confidence: 20,
      intelligence: 35, purpose: 10, energy: 20,
    },
    'Iron Ghost': {
      strength: 35, focus: 20, discipline: 25, confidence: 20,
      intelligence: 20, purpose: 20, energy: 10,
    },
  }
  return map[archetype]
}

export function getRankFromLevel(level: number): Rank {
  if (level >= 100) return 'Monarch'
  if (level >= 86) return 'S'
  if (level >= 71) return 'A'
  if (level >= 51) return 'B'
  if (level >= 31) return 'C'
  if (level >= 16) return 'D'
  if (level >= 6) return 'E'
  return 'F'
}

export function getXPToNextLevel(level: number): number {
  return level * 500
}

export function getXPReward(difficulty: QuestDifficulty): number {
  const map: Record<QuestDifficulty, number> = {
    small: 30,
    medium: 70,
    hard: 120,
    elite: 150,
  }
  return map[difficulty]
}

export function getArchetypeDescription(archetype: Archetype): {
  description: string
  weakness: string
  growth: string
} {
  const map: Record<Archetype, { description: string; weakness: string; growth: string }> = {
    'Silent Warrior': {
      description:
        'You carry immense untapped power, but your own mind is your greatest enemy. Self-doubt and fear of failure have kept you beneath your true potential.',
      weakness: 'You collapse under pressure and let one bad moment define the whole war.',
      growth: 'Build unshakeable self-belief through consistent small wins.',
    },
    'Dormant Titan': {
      description:
        'A force of nature held back by inconsistency. You have everything you need — discipline is the only key missing from your arsenal.',
      weakness: 'You start with fire but fade before the results arrive.',
      growth: 'Master the art of showing up when you don\'t feel like it.',
    },
    'Lost Hunter': {
      description:
        'Capable and intelligent, but without a map. Your energy is scattered across too many directions, leaving nothing concentrated enough to break through.',
      weakness: 'You move without a mission, and structure collapses every plan.',
      growth: 'Lock onto a single purpose and build your life around it.',
    },
    'Broken Mage': {
      description:
        'Your mind is powerful, but it has been hijacked. The digital world has fractured your focus into a thousand pieces that no longer reassemble.',
      weakness: 'Distraction is your deepest addiction, and it costs you everything daily.',
      growth: 'Reclaim your attention — it is your most valuable resource.',
    },
    'Overthinker Rogue': {
      description:
        'Brilliant, complex, and paralyzed by your own analysis. You see every angle of every move, and that very ability is what keeps you still.',
      weakness: 'You overthink until the moment passes and purpose feels impossible.',
      growth: 'Learn to act before certainty arrives — action creates clarity.',
    },
    'Iron Ghost': {
      description:
        'You have the drive and the vision, but your energy betrays you. You begin strong and fade before the finish line, leaving your best work unfinished.',
      weakness: 'Your physical foundation is crumbling beneath your ambitions.',
      growth: 'Build energy as a discipline — sleep, movement, and nutrition are your weapons.',
    },
  }
  return map[archetype]
}

export function getUniversalQuest(dayOfYear: number): {
  title: string
  description: string
  category: 'physical' | 'mental' | 'discipline'
  xp_reward: number
  stat_target: string
} {
  const quests = [
    {
      title: 'Hydration Protocol',
      description: 'Drink 8 glasses of water today. Track each one.',
      category: 'discipline' as const,
      xp_reward: 30,
      stat_target: 'energy',
    },
    {
      title: 'Movement Directive',
      description: 'Move your body for 30 continuous minutes. No excuses.',
      category: 'physical' as const,
      xp_reward: 30,
      stat_target: 'strength',
    },
    {
      title: 'System Log Entry',
      description: 'Write a journal entry: 5+ sentences about your day and mindset.',
      category: 'mental' as const,
      xp_reward: 30,
      stat_target: 'focus',
    },
  ]
  return quests[dayOfYear % 3]
}

export function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function formatTodayDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function getMonarchProgress(level: number): number {
  return Math.min(100, Math.floor((level / 100) * 100))
}

export function getKaizenThreshold(cycleNumber: number): number {
  if (cycleNumber >= 4) return 7
  if (cycleNumber === 3) return 6
  if (cycleNumber === 2) return 5
  return 4
}

export function getWeekNumber(): number {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
}

export function getRankColor(rank: Rank): string {
  const map: Record<Rank, string> = {
    F: '#8D96B8',
    E: '#6CCBFF',
    D: '#4B9EFF',
    C: '#A855F7',
    B: '#EC4899',
    A: '#F97316',
    S: '#EAB308',
    Monarch: '#8EF0FF',
  }
  return map[rank]
}
