const DAY_MS = 86400000
const SPORT_LABELS = {
  run: '跑步',
  trailRun: '越野跑',
  bike: '骑行',
  indoorBike: '室内骑行',
  poolSwim: '泳池游泳',
  openWater: '公开水域',
  strength: '力量训练',
  walk: '步行',
  hike: '徒步',
  other: '运动'
}

export function dateText(value) {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  return ''
}

export function todayText(now = new Date()) {
  return dateText(now)
}

export function addDays(value, days) {
  const date = new Date(`${dateText(value)}T12:00:00`)
  date.setDate(date.getDate() + Number(days || 0))
  return dateText(date)
}

export function daysBetween(start, end) {
  const a = new Date(`${dateText(start)}T12:00:00`).getTime()
  const b = new Date(`${dateText(end)}T12:00:00`).getTime()
  return Math.max(0, Math.round((b - a) / DAY_MS))
}

export function sportLabel(sport) {
  return SPORT_LABELS[sport] || SPORT_LABELS.other
}

function round(value, digits = 1) {
  const factor = 10 ** digits
  return Math.round((Number(value) || 0) * factor) / factor
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0))
}

function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length
}

function standardDeviation(values) {
  if (!values.length) return 0
  const mean = average(values)
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)))
}

export function activityLoad(activity, lthr = 0) {
  const given = Number(activity?.trainingLoad)
  if (Number.isFinite(given) && given > 0) return round(given, 0)
  const minutes = Number(activity?.durationMin) || 0
  if (minutes <= 0) return 0
  const hr = Number(activity?.avgHr) || 0
  const threshold = Number(lthr) || 165
  let intensity = 1
  if (hr > 0) intensity = clamp((hr - 45) / Math.max(40, threshold - 45), 0.45, 1.75)
  else if (['strength', 'poolSwim', 'openWater'].includes(activity?.sport)) intensity = 0.85
  else if (['walk', 'hike'].includes(activity?.sport)) intensity = 0.55
  return round(minutes * intensity, 0)
}

function dayMapFor(start, end) {
  const map = new Map()
  let cursor = start
  let guard = 0
  while (cursor <= end && guard < 370) {
    map.set(cursor, { date: cursor, activities: [], load: 0, distanceKm: 0, durationMin: 0 })
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return map
}

function readinessFor(day, today) {
  let score = 68
  const notes = []
  const hrv = Number(day.hrv) || 0
  const hrvBase = Number(day.hrvBase) || 0
  if (hrv > 0 && hrvBase > 0) {
    const ratio = hrv / hrvBase
    if (ratio >= 1.05) {
      score += 12
      notes.push('HRV 高于基线，恢复状态不错')
    } else if (ratio < 0.9) {
      score -= 18
      notes.push('HRV 低于基线，恢复不足')
    } else if (ratio < 0.97) {
      score -= 7
      notes.push('HRV 略低于基线')
    }
  }
  const rhr = Number(day.rhr) || 0
  if (rhr > 0) {
    const baseline = Number(today.rhrBase) || rhr
    if (rhr - baseline >= 7) {
      score -= 13
      notes.push('静息心率明显升高')
    } else if (rhr - baseline >= 4) {
      score -= 6
      notes.push('静息心率略高')
    } else if (rhr - baseline <= -2) {
      score += 4
    }
  }
  const tsb = Number(day.tsb) || 0
  if (tsb < -25) {
    score -= 15
    notes.push('短期疲劳明显高于长期体能')
  } else if (tsb > 12) {
    score += 5
  }
  const acwr = Number(day.acwr) || 0
  if (acwr > 1.45) {
    score -= 16
    notes.push('负荷增长过快，ACWR 偏高')
  } else if (acwr > 1.25) {
    score -= 7
    notes.push('负荷略高，注意恢复')
  } else if (acwr > 0 && acwr < 0.75) {
    score += 3
  }
  if (day.sleepScore > 0) {
    if (day.sleepScore < 60) {
      score -= 10
      notes.push('睡眠质量偏低')
    } else if (day.sleepScore >= 85) {
      score += 6
    }
  }
  return { score: Math.round(clamp(score, 5, 98)), notes }
}

function evaluationFor(day, lthr = 0) {
  if (!day || !day.activities.length) {
    return { label: '休息日', text: '今天没有训练记录，恢复也是训练的一部分。', tone: 'idle' }
  }
  const hard = day.activities.filter((activity) => activityLoad(activity, lthr) >= 80).length
  const minutes = Math.round(day.durationMin)
  const fatigueRatio = day.ctl > 12 ? day.atl / day.ctl : 0
  if (day.tsb <= -30 || fatigueRatio >= 1.6) {
    return { label: '疲劳累积', text: `完成 ${minutes} 分钟训练，短期负荷 ${Math.round(day.atl)} 已明显高于长期体能 ${Math.round(day.ctl)}，恢复优先级高于加量。`, tone: 'warn' }
  }
  if (day.load >= 120 || hard > 1) {
    return { label: '高负荷', text: `完成 ${minutes} 分钟训练，负荷 ${day.load}，已经形成明显刺激，接下来优先恢复。`, tone: 'warn' }
  }
  if (day.load >= 60) {
    return { label: '有效刺激', text: `完成 ${minutes} 分钟训练，负荷 ${day.load}，属于有效训练日。`, tone: 'ok' }
  }
  return { label: '轻松活动', text: `完成 ${minutes} 分钟低负荷活动，有利于保持节奏与恢复。`, tone: 'idle' }
}

function adviceFor(today, week) {
  const advice = []
  if (today.readiness < 45) {
    advice.push({ level: 'high', title: '今天减量', text: '准备度偏低。把高强度课改成轻松有氧或完全休息，避免在疲劳上叠加强度。' })
  } else if (today.readiness >= 75) {
    advice.push({ level: 'ok', title: '可以训练', text: '恢复状态良好，可以按计划完成主要训练；仍然建议用热身和体感做二次确认。' })
  } else {
    advice.push({ level: 'mid', title: '稳着来', text: '状态一般。主课可以保留，但降低强度或缩短时长，不追求额外加量。' })
  }
  if (today.acwr > 1.35) {
    advice.push({ level: 'high', title: '控制负荷增长', text: `ACWR ${today.acwr.toFixed(2)}，最近 7 天负荷明显高于 28 天平均。未来 3 天不要再加量。` })
  } else if (today.acwr > 0 && today.acwr < 0.8 && today.ctl > 20) {
    advice.push({ level: 'ok', title: '可以适当补充', text: '近期负荷低于长期体能，若身体无酸痛，可以增加一次轻松有氧。' })
  }
  if (today.tsb < -25) {
    advice.push({ level: 'high', title: '安排恢复', text: `TSB ${today.tsb.toFixed(0)}，疲劳正在累积。优先睡眠、补碳水和低强度活动。` })
  }
  if (today.monotony > 2.2) {
    advice.push({ level: 'mid', title: '增加变化', text: '本周训练单调性偏高。用一天轻松日或交叉训练打破重复刺激。' })
  }
  if (today.hrv > 0 && today.hrvBase > 0 && today.hrv / today.hrvBase < 0.9) {
    advice.push({ level: 'mid', title: '关注恢复信号', text: 'HRV 低于个人基线。今天不安排最大强度，训练后补充睡眠。' })
  }
  if (week.completion < 50 && week.total > 0) {
    advice.push({ level: 'mid', title: '任务别铺太满', text: `本周计划完成度 ${week.completion}%。把每天任务控制在 1–2 个关键项，比堆满清单更可持续。` })
  }
  return advice.slice(0, 5)
}

function predictionsFor(activities, lthr) {
  const runs = (activities || []).filter((activity) => (
    ['run', 'trailRun'].includes(activity.sport) && Number(activity.distanceKm) >= 3 && Number(activity.durationMin) > 0
  )).slice(0, 80)
  if (!runs.length) return []
  let best = null
  for (const run of runs) {
    const distance = Number(run.distanceKm) || 0
    const seconds = Number(run.durationMin) * 60
    if (distance < 3 || seconds <= 0) continue
    const estimate10k = seconds * (10 / distance) ** 1.06
    if (!best || estimate10k < best.estimate10k) best = { run, estimate10k, seconds, distance }
  }
  if (!best) return []
  const targets = [
    { key: '5k', label: '5K', km: 5 },
    { key: '10k', label: '10K', km: 10 },
    { key: 'half', label: '半马', km: 21.0975 },
    { key: 'full', label: '全马', km: 42.195 }
  ]
  return targets.map((target) => {
    const seconds = best.estimate10k * (target.km / 10) ** 1.06
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.round(seconds % 60)
    return {
      key: target.key,
      label: target.label,
      time: hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`,
      pace: Math.round(seconds / 60 / target.km * 10) / 10,
      source: best.run.name || '最近最佳跑步'
    }
  })
}

function taskCompletionFor(tasks, date) {
  const roots = (tasks || []).filter((task) => !task.parentId)
  const due = roots.filter((task) => task.dueDate === date)
  const done = due.filter((task) => task.completed)
  return { total: due.length, done: done.length, completion: due.length ? Math.round(done.length / due.length * 100) : 0 }
}

export function computeCoach(state, options = {}) {
  const today = dateText(options.today) || todayText()
  const activities = Array.isArray(state?.activities) ? state.activities : []
  const metrics = Array.isArray(state?.dailyMetrics) ? state.dailyMetrics : []
  const reviews = Array.isArray(state?.reviews) ? state.reviews : []
  const tasks = Array.isArray(state?.tasks) ? state.tasks : []
  const lthr = Number(metrics.find((row) => row.date === today)?.lthr)
    || Number([...metrics].reverse().find((row) => row.lthr)?.lthr)
    || 0
  const metricMap = new Map(metrics.map((row) => [row.date, row]))
  const earliestActivity = activities.reduce((min, activity) => (!min || activity.date < min ? activity.date : min), '')
  const start = earliestActivity && daysBetween(earliestActivity, today) < 140
    ? addDays(earliestActivity, -1)
    : addDays(today, -119)
  const days = dayMapFor(start, today)

  for (const activity of activities) {
    const day = days.get(activity.date)
    if (!day) continue
    const load = activityLoad(activity, lthr)
    day.activities.push(activity)
    day.load += load
    day.distanceKm += Number(activity.distanceKm) || 0
    day.durationMin += Number(activity.durationMin) || 0
    if (!day.avgHr && activity.avgHr) day.avgHr = activity.avgHr
  }

  const ordered = [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
  const rhrBase = average(metrics.slice(-14).map((row) => row.rhr).filter(Boolean))
    || Number(ordered.find((row) => row.date === today)?.rhr) || 0
  let ctl = 0
  let atl = 0
  for (const day of ordered) {
    const metric = metricMap.get(day.date)
    if (metric) {
      if (!day.activities.length && Number(metric.trainingLoad) > 0) {
        day.load = Number(metric.trainingLoad)
      }
      day.hrv = Number(metric.hrv) || 0
      day.hrvBase = Number(metric.hrvBase) || 0
      day.hrvSd = Number(metric.hrvSd) || 0
      day.rhr = Number(metric.rhr) || 0
      day.sleepScore = Number(metric.sleepScore) || 0
      day.sleepMin = Number(metric.sleepMin) || 0
      day.vo2max = Number(metric.vo2max) || 0
      day.lthr = Number(metric.lthr) || 0
      day.ltsp = Number(metric.ltsp) || 0
      day.stamina = Number(metric.stamina) || 0
      day.performance = Number(metric.performance) || 0
    }
    ctl += (day.load - ctl) / 42
    atl += (day.load - atl) / 7
    day.ctl = Math.round(ctl * 10) / 10
    day.atl = Math.round(atl * 10) / 10
    day.tsb = Math.round((ctl - atl) * 10) / 10
    day.load = Math.round(day.load)
    day.distanceKm = round(day.distanceKm, 2)
    day.durationMin = Math.round(day.durationMin)
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const day = ordered[index]
    const last7 = ordered.slice(Math.max(0, index - 6), index + 1)
    const last28 = ordered.slice(Math.max(0, index - 27), index + 1)
    const acute = last7.reduce((sum, row) => sum + row.load, 0)
    // Compare this week with the athlete's available chronic baseline, not
    // with a 28-day window padded with artificial zeros at the start.
    const availableDays = Math.min(28, index + 1)
    const chronic = availableDays > 0
      ? (last28.reduce((sum, row) => sum + row.load, 0) / availableDays) * 7
      : 0
    day.acwr = chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : 0
    const values = last7.map((row) => row.load)
    const mean = average(values)
    const sd = standardDeviation(values)
    day.monotony = sd > 0 ? Math.round((mean / sd) * 10) / 10 : 0
    day.strain = Math.round(day.load * (day.monotony || 1))
    day.weekLoad = Math.round(last7.reduce((sum, row) => sum + row.load, 0))
    day.load28 = Math.round(last28.reduce((sum, row) => sum + row.load, 0))
    const readiness = readinessFor(day, { rhrBase })
    day.readiness = readiness.score
    day.dataFatigue = 100 - readiness.score
    day.readinessNotes = readiness.notes
    day.evaluation = evaluationFor(day, lthr)
  }

  const todayRow = ordered.find((row) => row.date === today) || ordered[ordered.length - 1] || {}
  const enrichedToday = { ...todayRow, rhrBase }
  const readiness = readinessFor(enrichedToday, { rhrBase })
  const weekDays = ordered.slice(-7)
  const week = {
    load: weekDays.reduce((sum, row) => sum + row.load, 0),
    distanceKm: round(weekDays.reduce((sum, row) => sum + row.distanceKm, 0), 1),
    durationMin: weekDays.reduce((sum, row) => sum + row.durationMin, 0),
    sessions: weekDays.reduce((sum, row) => sum + row.activities.length, 0),
    ...taskCompletionFor(tasks, today),
    title: '最近 7 天'
  }
  const todayOut = {
    ...enrichedToday,
    readiness: readiness.score,
    dataFatigue: 100 - readiness.score,
    readinessNotes: readiness.notes,
    evaluation: evaluationFor(todayRow, lthr),
    week
  }
  const advice = adviceFor(todayOut, week)
  const predictions = predictionsFor(activities, lthr)
  const dayReviews = new Map(reviews.filter((row) => row.period === 'day').map((row) => [row.date, row]))
  for (const day of ordered) {
    const review = dayReviews.get(day.date)
    if (!review) continue
    day.review = {
      fatigue: review.subjectiveFatigue || 0,
      rating: review.trainingRating || review.rating || 0,
      diary: review.diary || '',
      note: review.note || ''
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    today: todayOut,
    days: ordered.slice(-90),
    week,
    advice,
    predictions,
    recent: [...activities].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12)
  }
}
