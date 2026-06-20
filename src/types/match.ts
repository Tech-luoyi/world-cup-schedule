export interface Match {
  id: string
  utcTimestamp: string // "2026-06-14T17:00:00" — 原始UTC时间，用于倒计时计算
  date: string          // "2026-06-14" — UTC+8 日期
  time: string          // "01:00" — UTC+8 时间
  homeTeam: string      // 中文队名 "荷兰"
  awayTeam: string
  homeTeamKey: string   // 英文队名 "Netherlands" — 用于跳转球队页面
  awayTeamKey: string
  homeFlag: string
  awayFlag: string
  homeScore?: number
  awayScore?: number
  status: "upcoming" | "live" | "finished"
  venue: string
  heatIndex: number
  discussionCount: number
  stage: string
  groupLetter?: string
}

// Raw data from smach/worldcup26 API
export interface SmachMatch {
  match_id: number
  utc_date: string
  match_date: string
  kickoff: string
  matchday: number
  stage: string
  stage_label: string
  knockout: boolean
  group_letter: string | null
  home_team: string
  home_tla: string
  away_team: string
  away_tla: string
  status: string
  score_display: string | null
  home_score: number | null
  away_score: number | null
  home_pk: number | null
  away_pk: number | null
  is_finished: boolean
  is_upcoming: boolean
  is_today: boolean
  venue: string | null
}
