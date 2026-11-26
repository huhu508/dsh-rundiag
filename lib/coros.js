import { createHash } from 'node:crypto'

export const REGIONS = {
  cn: { label: '中国大陆', base: 'https://teamcnapi.coros.com' },
  en: { label: '国际（美洲）', base: 'https://teamapi.coros.com' },
  eu: { label: '欧洲', base: 'https://teameuapi.coros.com' }
}

const SPORT_BY_ID = new Map([
  [100, 'run'],
  [101, 'run'],
  [102, 'trailRun'],
  [103, 'trailRun'],
  [200, 'bike'],
  [201, 'indoorBike'],
  [202, 'bike'],
  [300, 'poolSwim'],
  [301, 'openWater'],
  [302, 'poolSwim'],
  [400, 'strength'],
  [402, 'strength'],
  [900, 'walk'],
  [901, 'hike'],
  [1000, 'hike'],
  [1001, 'hike']
])

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

export function sportLabel(key) {
  return SPORT_LABELS[key] || SPORT_LABELS.other
}

function corosError(message, code = 'coros_error') {
  const error = new Error(message)
  error.code = code
  return error
}

function md5(value) {
  return createHash('md5').update(String(value), 'utf8').digest('hex')
}

function dateCode(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function isoDate(value) {
  if (value && /^\d{8}$/.test(String(value))) {
    const s = String(value)
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  if (value && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return String(value).slice(0, 10)
  if (value && Number.isFinite(Number(value))) {
    const date = new Date(Number(value) * 1000)
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
  }
  return ''
}

async function requestJson(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'dsh-rundiag/0.6.0 (+https://github.com/huhu508/dsh-rundiag)',
        ...(options.headers || {})
      }
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw corosError('COROS 请求超时，请检查网络或代理。', 'timeout')
    throw corosError(`无法连接 COROS：${error?.message || '网络错误'}`, 'network')
  } finally {
    clearTimeout(timer)
  }
  const raw = await response.text()
  let body
  try {
    body = raw ? JSON.parse(raw) : {}
  } catch {
    throw corosError(`COROS 返回了非 JSON 响应（HTTP ${response.status}）。`, 'bad_response')
  }
  if (response.status === 401 || response.status === 403) {
    throw corosError('COROS 登录状态已失效，请重新连接。', 'unauthorized')
  }
  if (!response.ok) {
    const message = body?.message || body?.msg || `HTTP ${response.status}`
    throw corosError(`COROS 接口错误：${message}`, 'http_error')
  }
  return body
}

function assertResult(body) {
  const result = body?.result
  if (result === undefined || result === null) return body
  if (String(result) === '0000' || String(result) === '0') return body
  const message = body?.message || body?.msg || body?.error?.message || `错误码 ${result}`
  if (String(result) === '1010' || String(result) === '1011' || /token/i.test(String(message))) {
    throw corosError(`COROS 登录状态已失效：${message}`, 'unauthorized')
  }
  if (String(result) === '4290' || /频繁|frequent|limit/i.test(String(message))) {
    throw corosError(`COROS 请求过于频繁，请稍后再试：${message}`, 'rate_limited')
  }
  throw corosError(`COROS 返回错误：${message}`, 'api_error')
}

export function buildLoginPayload(account, password) {
  const loginAccount = String(account || '').trim().replace(/\s+/g, '')
  return { account: loginAccount, accountType: 2, pwd: md5(password) }
}

export async function login(region, account, password) {
  const zone = REGIONS[region] || REGIONS.cn
  const payload = buildLoginPayload(account, password)
  const loginAccount = payload.account
  if (!loginAccount || !password) throw corosError('请填写 COROS 邮箱或手机号和密码。', 'bad_input')
  const body = await requestJson(`${zone.base}/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  assertResult(body)
  const data = body?.data || {}
  const token = data.accessToken || data.token || data.access_token
  if (!token) throw corosError('登录成功但未拿到 accessToken，请尝试使用区域切换或 Token 方式。', 'no_token')
  return {
    token: String(token),
    account: String(data.email || data.account || loginAccount).trim(),
    userId: data.userId || data.id || '',
    name: data.nickname || data.name || ''
  }
}

export async function probeToken(region, token) {
  const zone = REGIONS[region] || REGIONS.cn
  const end = new Date()
  const start = new Date(end.getTime() - 2 * 86400000)
  const query = new URLSearchParams({
    pageNumber: '1',
    size: '1',
    startDay: dateCode(start),
    endDay: dateCode(end)
  })
  const body = await requestJson(`${zone.base}/activity/query?${query.toString()}`, {
    headers: { accessToken: String(token) }
  })
  assertResult(body)
  return true
}

function normalizeSport(value, name) {
  const id = Number(value?.sportType ?? value?.sportId ?? value?.type)
  if (SPORT_BY_ID.has(id)) return SPORT_BY_ID.get(id)
  const label = String(name || value?.sportName || '').toLowerCase()
  if (/trail|越野/.test(label)) return 'trailRun'
  if (/run|跑步/.test(label)) return 'run'
  if (/bike|cycle|骑行/.test(label)) return 'bike'
  if (/swim|游泳/.test(label)) return 'poolSwim'
  if (/strength|力量/.test(label)) return 'strength'
  if (/walk|步行/.test(label)) return 'walk'
  if (/hike|徒步/.test(label)) return 'hike'
  return 'other'
}

export function normalizeActivity(raw) {
  if (!raw || typeof raw !== 'object') return null
  const date = isoDate(raw.date || raw.startTime || raw.startDate)
  if (!date) return null
  const sport = normalizeSport(raw, raw.name)
  const idValue = raw.labelId || raw.id || raw.activityId || raw.groupId
    || `${raw.startTime || 'x'}-${raw.sportType || sport}`
  const distance = Number(raw.distance ?? raw.totalDistance ?? raw.distanceMeters ?? 0)
  const seconds = Number(raw.workoutTime ?? raw.totalTime ?? raw.duration ?? 0)
  const distanceKm = Number.isFinite(distance) ? Math.round((distance / 1000) * 100) / 100 : 0
  const durationMin = Number.isFinite(seconds) ? Math.round((seconds / 60) * 10) / 10 : 0
  const caloriesRaw = Number(raw.calorie ?? raw.calories ?? 0)
  const calories = Number.isFinite(caloriesRaw) && caloriesRaw > 0
    ? Math.round(caloriesRaw > 2000 ? caloriesRaw / 1000 : caloriesRaw)
    : 0
  const number = (key, fallback = 0) => {
    const value = Number(raw[key])
    return Number.isFinite(value) ? Math.round(value * 10) / 10 : fallback
  }
  return {
    id: `coros:${String(idValue)}`,
    apiId: String(idValue),
    source: 'coros',
    date,
    sport,
    name: String(raw.name || raw.title || sportLabel(sport)).slice(0, 200),
    distanceKm,
    durationMin,
    startTime: raw.startTime ? String(raw.startTime) : '',
    endTime: raw.endTime ? String(raw.endTime) : '',
    avgHr: Math.round(number('avgHr', 0)),
    maxHr: Math.round(number('maxHr', 0)),
    calories,
    trainingLoad: Math.round(number('trainingLoad', 0)),
    avgPower: Math.round(number('avgPower', 0)),
    normalizedPower: Math.round(number('np', number('normalizedPower', 0))),
    elevationGain: Math.round(number('ascent', number('elevationGain', 0))),
    elevationLoss: Math.round(number('descent', number('elevationLoss', 0))),
    matchedTaskIds: []
  }
}

function dailyList(body) {
  const data = body?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.dataList)) return data.dataList
  if (Array.isArray(data?.list)) return data.list
  if (Array.isArray(data?.dayList)) return data.dayList
  if (Array.isArray(body?.dataList)) return body.dataList
  return []
}

export function normalizeDailyMetric(raw) {
  if (!raw || typeof raw !== 'object') return null
  const date = isoDate(raw.happenDay || raw.date || raw.day || raw.startDay)
  if (!date) return null
  const num = (...keys) => {
    for (const key of keys) {
      const value = Number(raw[key])
      if (Number.isFinite(value) && value !== 0) return value
    }
    return 0
  }
  return {
    date,
    hrv: num('avgSleepHrv', 'sleepHrv', 'hrv'),
    hrvBase: num('sleepHrvBase', 'hrvBase'),
    hrvSd: num('sleepHrvSd', 'hrvSd'),
    rhr: num('rhr', 'restingHr', 'restingHeartRate'),
    sleepScore: num('sleepScore', 'sleepQualityScore', 'qualityScore'),
    sleepMin: num('totalSleepTime', 'sleepTime', 'totalSleepMinutes'),
    trainingLoad: num('trainingLoad', 'trainingLoadValue'),
    loadRatio: num('trainingLoadRatio', 'loadRatio'),
    ati: num('ati', 'atiValue'),
    cti: num('cti', 'ctiValue'),
    performance: num('performance', 'performanceIndex'),
    distanceKm: Math.round(num('distance', 'distanceMeters') / 10) / 100,
    durationMin: Math.round(num('duration', 'durationSeconds') / 6) / 10,
    vo2max: num('vo2max', 'vo2Max'),
    lthr: num('lthr', 'lactateThresholdHr'),
    ltsp: num('ltsp', 'lactateThresholdPace'),
    stamina: num('staminaLevel', 'stamina'),
    stamina7d: num('staminaLevel7d', 'stamina7d')
  }
}

export async function fetchDailyMetrics(region, token, options = {}) {
  const zone = REGIONS[region] || REGIONS.cn
  if (!token) return { metrics: [], warning: 'not_connected' }
  const days = Math.max(7, Math.min(180, Number(options.days) || 120))
  const end = options.end ? new Date(options.end) : new Date()
  const start = new Date(end.getTime() - days * 86400000)
  const query = new URLSearchParams({ startDay: dateCode(start), endDay: dateCode(end) })
  const merged = new Map()
  let warning = ''
  const endpoints = [
    `${zone.base}/analyse/dayDetail/query?${query.toString()}`,
    `${zone.base}/analyse/query?${query.toString()}`
  ]
  for (const url of endpoints) {
    try {
      const body = await requestJson(url, { headers: { accessToken: String(token) } })
      assertResult(body)
      for (const item of dailyList(body)) {
        const metric = normalizeDailyMetric(item)
        if (!metric) continue
        const existing = merged.get(metric.date) || { date: metric.date }
        for (const [key, value] of Object.entries(metric)) {
          if (key === 'date') continue
          if (value !== 0 || existing[key] === undefined) existing[key] = value
        }
        merged.set(metric.date, existing)
      }
    } catch (error) {
      warning = String(error?.message || error).slice(0, 300)
    }
  }
  return {
    metrics: [...merged.values()].sort((a, b) => a.date.localeCompare(b.date)),
    warning
  }
}

export async function fetchActivities(region, token, options = {}) {
  const zone = REGIONS[region] || REGIONS.cn
  if (!token) throw corosError('尚未连接 COROS，请先登录。', 'unauthorized')
  const days = Math.max(1, Math.min(90, Number(options.days) || 30))
  const end = options.end ? new Date(options.end) : new Date()
  const start = new Date(end.getTime() - days * 86400000)
  const activities = []
  let totalPage = 1
  for (let page = 1; page <= Math.min(10, totalPage); page += 1) {
    const query = new URLSearchParams({
      pageNumber: String(page),
      size: '100',
      startDay: dateCode(start),
      endDay: dateCode(end)
    })
    const body = await requestJson(`${zone.base}/activity/query?${query.toString()}`, {
      headers: { accessToken: String(token) }
    })
    assertResult(body)
    const data = body?.data || {}
    const list = Array.isArray(data.dataList) ? data.dataList : Array.isArray(data.list) ? data.list : []
    totalPage = Math.max(1, Number(data.totalPage || data.totalPages || 1))
    for (const item of list) {
      const activity = normalizeActivity(item)
      if (activity) activities.push(activity)
    }
    if (!list.length) break
  }
  const unique = new Map(activities.map((activity) => [activity.id, activity]))
  return [...unique.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}
