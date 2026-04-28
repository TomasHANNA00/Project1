export type ClientStatus = 'on_track' | 'at_risk' | 'stuck' | 'completed' | 'pending'

interface StatusInput {
  has_project: boolean
  total: number
  completed: number
  last_activity_at: string | null
  invited_at?: string | null
}

export function deriveStatus(client: StatusInput): ClientStatus {
  if (!client.has_project) return 'pending'
  if (client.total > 0 && client.completed >= client.total) return 'completed'

  const lastActivity = client.last_activity_at ?? client.invited_at ?? null
  const daysSince = lastActivity
    ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
    : 999

  if (daysSince >= 14) return 'stuck'
  if (daysSince >= 7) return 'at_risk'
  return 'on_track'
}

const ADMIN_PALETTE = ['#7C3AED', '#0369A1', '#0F766E', '#B45309', '#BE185D', '#DC2626']

export function adminColor(name: string): string {
  if (!name) return ADMIN_PALETTE[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0
  }
  return ADMIN_PALETTE[Math.abs(hash) % ADMIN_PALETTE.length]
}
