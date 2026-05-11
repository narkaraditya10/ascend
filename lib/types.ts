export type Rank = 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'Monarch'
export type Archetype =
  | 'Silent Warrior'
  | 'Dormant Titan'
  | 'Lost Hunter'
  | 'Broken Mage'
  | 'Overthinker Rogue'
  | 'Iron Ghost'
export type QuestType = 'mandatory' | 'side' | 'elite'
export type QuestCategory = 'physical' | 'mental' | 'discipline' | 'elite' | 'lifestyle' | 'focus' | 'bad_habits'
export type QuestDifficulty = 'small' | 'medium' | 'hard' | 'elite'
export type PoolCategory = 'lifestyle' | 'physical' | 'mental' | 'focus' | 'bad_habits' | 'elite'

export interface UserProfile {
  id: string
  email: string
  created_at: string
  hunter_name: string | null
  archetype: Archetype | null
  rank: Rank
  level: number
  total_xp: number
  current_xp: number
  xp_to_next_level: number
  commitment_text: string | null
  current_streak: number
  best_streak: number
  last_active_date: string | null
  elite_quest_assigned_week: number | null
  needs_selection: boolean | null
  penalty_tier: number
  consecutive_failures: number
  penalty_zone_active: boolean
  penalty_zone_started_at: string | null
  penalty_zone_active_time: number
  penalty_zone_completed: boolean
}

export interface PenaltyQuest {
  id: string
  user_id: string
  title: string
  description: string | null
  xp_reward: number
  is_completed: boolean
  date_assigned: string
  created_at: string
}

export interface Stats {
  id: string
  user_id: string
  strength: number
  focus: number
  discipline: number
  confidence: number
  intelligence: number
  purpose: number
  energy: number
  updated_at: string
}

export interface Quest {
  id: string
  user_id: string
  title: string
  description: string | null
  category: QuestCategory
  quest_type: QuestType
  xp_reward: number
  stat_target: string | null
  stat_reward: number | null
  is_completed: boolean
  date_assigned: string
  date_completed: string | null
  quest_pool_id: string | null
}

export interface ArchetypeQuest {
  id: string
  archetype: Archetype
  title: string
  description: string | null
  category: QuestCategory
  xp_reward: number
  stat_target: string | null
  difficulty: QuestDifficulty
}

export interface QuestPool {
  id: string
  title: string
  description: string | null
  category: PoolCategory
  xp_reward: number
  difficulty: QuestDifficulty
  stat_target: string | null
  stat_reward: number | null
  upgrade_group: string | null
}

export interface QuestSelection {
  id: string
  user_id: string
  quest_pool_id: string
  category: string
  cycle_number: number
  selected_date: string
  expires_date: string
  is_active: boolean
  quest_pools?: QuestPool
}

export interface Cycle {
  id: string
  user_id: string
  cycle_number: number
  started_date: string
  ended_date: string | null
  total_completions: number
  total_days_active: number
  is_complete: boolean
}

export interface CycleReportData {
  cycle: Cycle
  totalCompletions: number
  totalDaysActive: number
  bestStreak: number
  newCycleNumber: number
}

export interface QuestCompletionResult {
  success: boolean
  leveledUp: boolean
  newLevel?: number
  newRank?: Rank
  previousRank?: Rank
  rankChanged?: boolean
  eliteUnlocked?: boolean
  xpEarned?: number
  statTarget?: string | null
  statReward?: number | null
  error?: string
}
