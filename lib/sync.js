import { applyActivities, applyDailyMetrics } from './state.js'
import { fetchActivities, fetchDailyMetrics } from './coros.js'

export async function syncCoros(state, options = {}) {
  const coros = state?.integrations?.coros
  if (!coros?.token) throw new Error('尚未连接 COROS。')
  const days = Math.max(1, Math.min(90, Number(options.days) || 30))
  const activities = await fetchActivities(coros.region, coros.token, { days })
  const result = applyActivities(state, activities)
  let metricsResult = { added: 0, updated: 0 }
  let metricWarning = ''
  let metricCount = 0
  try {
    const metrics = await fetchDailyMetrics(coros.region, coros.token, {
      days: Math.max(30, days)
    })
    metricsResult = applyDailyMetrics(state, metrics.metrics)
    metricCount = metrics.metrics.length
    metricWarning = metrics.warning || ''
    if (metricCount) coros.lastMetricsAt = new Date().toISOString()
  } catch (error) {
    metricWarning = String(error?.message || error).slice(0, 300)
  }
  return {
    activities,
    result: { ...result, metrics: metricsResult, metricCount, metricWarning }
  }
}
