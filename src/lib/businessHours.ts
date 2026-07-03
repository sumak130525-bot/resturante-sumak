/**
 * Business hours helper for Restaurante Sumak
 *
 * Schedule: Monday–Saturday 08:00–22:30, Sunday closed
 * Timezone: America/Argentina/Mendoza
 *
 * Also checks:
 *   - closure_days (special closure dates from DB/API)
 *   - kitchen_status.effective_closed (manual/schedule overrides)
 */

export const TIMEZONE = 'America/Argentina/Mendoza'

/** Mon–Sat: 08:00–22:30. Sunday (0) = null (closed). */
const WEEKLY_HOURS: Record<number, { open: number; close: number } | null> = {
  0: null,                      // Sunday
  1: { open: 8 * 60,      close: 22 * 60 + 30 }, // Monday
  2: { open: 8 * 60,      close: 22 * 60 + 30 }, // Tuesday
  3: { open: 8 * 60,      close: 22 * 60 + 30 }, // Wednesday
  4: { open: 8 * 60,      close: 22 * 60 + 30 }, // Thursday
  5: { open: 8 * 60,      close: 22 * 60 + 30 }, // Friday
  6: { open: 8 * 60,      close: 22 * 60 + 30 }, // Saturday
}

export interface ClosureDayRecord {
  start_date: string   // 'YYYY-MM-DD'
  end_date: string | null
}

/**
 * Pure function – checks the hardcoded weekly schedule against a given Date.
 * Returns true if the restaurant is open (by schedule alone, no DB checks).
 */
export function isOpenBySchedule(now: Date = new Date()): boolean {
  // Get current time in Mendoza
  const mendozaStr = now.toLocaleString('en-US', { timeZone: TIMEZONE })
  const mendoza = new Date(mendozaStr)

  const dayOfWeek = mendoza.getDay()  // 0=Sun … 6=Sat
  const hours = mendoza.getHours()
  const minutes = mendoza.getMinutes()
  const nowMinutes = hours * 60 + minutes

  const dayConf = WEEKLY_HOURS[dayOfWeek]
  if (!dayConf) return false  // Closed day

  return nowMinutes >= dayConf.open && nowMinutes < dayConf.close
}

/**
 * Returns 'YYYY-MM-DD' for today in Mendoza timezone.
 */
export function todayInMendoza(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

/**
 * Checks whether today falls within any special closure day range.
 */
export function isSpecialClosure(
  closureDays: ClosureDayRecord[],
  now: Date = new Date()
): boolean {
  const today = todayInMendoza(now)
  return closureDays.some((d) => {
    if (d.end_date) {
      return today >= d.start_date && today <= d.end_date
    }
    return today === d.start_date
  })
}

/**
 * Full check:
 *   1. Weekly schedule
 *   2. Special closure days
 *   3. kitchen_status.effective_closed (if provided)
 *
 * Returns true only if ALL checks pass (restaurant is open).
 */
export function isRestaurantOpen(opts: {
  closureDays?: ClosureDayRecord[]
  kitchenEffectiveClosed?: boolean
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()

  if (!isOpenBySchedule(now)) return false

  if (opts.closureDays && isSpecialClosure(opts.closureDays, now)) return false

  if (opts.kitchenEffectiveClosed === true) return false

  return true
}
