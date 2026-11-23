window.__ModuleLoader__.load({
  id: 'dsh-rundiag',
  factory(require) {
    const React = require('react')
    const {
      useEffect,
      useMemo,
      useRef,
      useState
    } = React

    const h = React.createElement
    const NS = 'dsh-rundiag'
    const TAB_ID = 'dsh-rundiag:rundiag'
    const TAB_KIND = 'rundiag'
    const API_PREFIX = 'rundiag/api'
    const SPORT_OPTIONS = [
      ['all', '全部运动'],
      ['run', '跑步'],
      ['trailRun', '越野跑'],
      ['bike', '骑行'],
      ['indoorBike', '室内骑行'],
      ['poolSwim', '泳池游泳'],
      ['openWater', '公开水域'],
      ['strength', '力量训练'],
      ['walk', '步行'],
      ['hike', '徒步'],
      ['other', '其他']
    ]
    const SPORT_LABELS = Object.fromEntries(SPORT_OPTIONS)
    const REGION_LABELS = { cn: '中国大陆', en: '国际（美洲）', eu: '欧洲' }
    const PRIORITY_LABELS = { 1: '高', 2: '中', 3: '低', 4: '无' }
    const TASK_CATEGORIES = [
      ['training', '训练', '训', 'warn'],
      ['study', '学习', '学', 'brand'],
      ['work', '工作', '工', 'idle'],
      ['life', '生活', '生', 'error'],
      ['create', '创作', '创', 'muted'],
      ['other', '其他', '其', 'brand']
    ]
    const TASK_CATEGORY_MAP = Object.fromEntries(TASK_CATEGORIES.map(([id, label, glyph, tone]) => [id, { id, label, glyph, tone }]))
    function categoryOf(task) {
      return TASK_CATEGORY_MAP[task?.category] || TASK_CATEGORY_MAP.other
    }

    // ---------------------------------------------------------------- utilities

    function apiBase() {
      const base = new URL(document.baseURI)
      base.search = ''
      base.hash = ''
      if (!base.pathname.endsWith('/')) base.pathname = base.pathname.replace(/[^/]*$/, '')
      return base
    }

    function apiUrl(path) {
      return new URL(`${API_PREFIX}/${path}`, apiBase()).toString()
    }

    async function api(path, options = {}) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), options.timeout || 25000)
      try {
        const response = await fetch(apiUrl(path), {
          method: options.method || 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
          headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
          body: options.body ? JSON.stringify(options.body) : undefined
        })
        const raw = await response.text()
        let body
        try {
          body = raw ? JSON.parse(raw) : {}
        } catch {
          throw new Error(`服务器返回了非 JSON 响应（HTTP ${response.status}）。`)
        }
        if (!response.ok || body.ok === false) {
          throw new Error(body?.error?.message || `请求失败（HTTP ${response.status}）。`)
        }
        return body
      } catch (error) {
        if (error?.name === 'AbortError') throw new Error('请求超时，请稍后重试。')
        throw error
      } finally {
        clearTimeout(timeout)
      }
    }

    function newId(prefix) {
      if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`
      return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
    }

    function todayStr() {
      return dateStr(new Date())
    }

    function dateStr(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    function parseDate(value) {
      if (!value) return null
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
      if (!match) return null
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    }

    function addDays(value, days) {
      const date = parseDate(value) || new Date()
      date.setDate(date.getDate() + days)
      return dateStr(date)
    }

    function startOfWeek(value) {
      const date = parseDate(value) || new Date()
      const day = date.getDay() || 7
      date.setDate(date.getDate() - day + 1)
      return dateStr(date)
    }

    function shortDate(value) {
      const date = parseDate(value)
      if (!date) return ''
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }

    function weekday(value) {
      const date = parseDate(value)
      if (!date) return ''
      return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
    }

    function dateLabel(value) {
      if (!value) return '无日期'
      const today = todayStr()
      if (value === today) return '今天'
      if (value === addDays(today, 1)) return '明天'
      if (value === addDays(today, -1)) return '昨天'
      const date = parseDate(value)
      if (!date) return value
      const diff = Math.round((date - parseDate(today)) / 86400000)
      if (diff > 1 && diff < 7) return weekday(value)
      return `${shortDate(value)} ${weekday(value)}`
    }

    function isOverdue(value) {
      return Boolean(value) && value < todayStr()
    }

    function formatClock(value) {
      const date = value ? new Date(value) : null
      if (!date || Number.isNaN(date.getTime())) return ''
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    function timeAgo(value) {
      if (!value) return '从未'
      const time = new Date(value).getTime()
      if (!Number.isFinite(time)) return '未知'
      const minutes = Math.round((Date.now() - time) / 60000)
      if (minutes < 1) return '刚刚'
      if (minutes < 60) return `${minutes} 分钟前`
      const hours = Math.round(minutes / 60)
      if (hours < 24) return `${hours} 小时前`
      return `${Math.round(hours / 24)} 天前`
    }

    function clampPercent(value) {
      if (!Number.isFinite(value)) return 0
      return Math.max(0, Math.min(100, Math.round(value)))
    }

    function round(value, digits = 1) {
      const factor = 10 ** digits
      return Math.round(Number(value || 0) * factor) / factor
    }

    function sortTasks(a, b) {
      const aOrder = Number.isFinite(a.order) ? a.order : 0
      const bOrder = Number.isFinite(b.order) ? b.order : 0
      if (aOrder !== bOrder) return aOrder - bOrder
      if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1
      const aDue = a.dueDate || '9999-99-99'
      const bDue = b.dueDate || '9999-99-99'
      if (aDue !== bDue) return aDue.localeCompare(bDue)
      if ((a.priority || 4) !== (b.priority || 4)) return (a.priority || 4) - (b.priority || 4)
      return 0
    }

    // ------------------------------------------------------------- task index

    function buildIndex(tasks) {
      const byParent = new Map()
      const byId = new Map()
      for (const task of tasks) byId.set(task.id, task)
      for (const task of tasks) {
        const parent = task.parentId && byId.has(task.parentId) ? task.parentId : null
        if (!byParent.has(parent)) byParent.set(parent, [])
        byParent.get(parent).push(task)
      }
      for (const list of byParent.values()) list.sort(sortTasks)
      const done = new Map()
      const visiting = new Set()
      const compute = (task, depth) => {
        if (done.has(task.id)) return done.get(task.id)
        if (visiting.has(task.id) || depth > 40) return Boolean(task.completed)
        visiting.add(task.id)
        const children = byParent.get(task.id) || []
        const value = children.length
          ? children.every((child) => compute(child, depth + 1))
          : Boolean(task.completed)
        visiting.delete(task.id)
        done.set(task.id, value)
        return value
      }
      for (const task of tasks) compute(task, 0)
      const roots = byParent.get(null) || []
      const leaves = tasks.filter((task) => !(byParent.get(task.id) || []).length)
      return {
        byParent,
        byId,
        done,
        roots,
        leaves,
        hasChildren: (id) => (byParent.get(id) || []).length > 0,
        childrenOf: (id) => byParent.get(id) || [],
        isDone: (task) => done.get(task.id) || false,
        progress(task) {
          const children = byParent.get(task.id) || []
          if (children.length) {
            const complete = children.filter((child) => compute(child, 0)).length
            return {
              current: complete,
              target: children.length,
              percent: children.length ? (complete / children.length) * 100 : 0,
              label: `${complete}/${children.length} 子任务`
            }
          }
          const progress = task.progress || { mode: 'check', current: 0, target: 1, unit: '' }
          if (progress.mode === 'check') {
            return {
              current: done.get(task.id) ? 1 : 0,
              target: 1,
              percent: done.get(task.id) ? 100 : 0,
              label: done.get(task.id) ? '已完成' : '待完成'
            }
          }
          const target = Number(progress.target) || 1
          const current = Number(progress.current) || 0
          return {
            current,
            target,
            percent: (current / target) * 100,
            label: `${round(current, current % 1 ? 1 : 0)}/${round(target, target % 1 ? 1 : 0)} ${progress.unit || ''}`.trim()
          }
        },
        dateBounds(task) {
          let start = task.dueDate || ''
          let end = task.dueDate || ''
          const collect = (parentId, depth) => {
            if (depth > 20) return
            for (const child of byParent.get(parentId) || []) {
              if (child.dueDate) {
                if (!start || child.dueDate < start) start = child.dueDate
                if (!end || child.dueDate > end) end = child.dueDate
              }
              collect(child.id, depth + 1)
            }
          }
          collect(task.id, 0)
          return { start, end }
        }
      }
    }

    function syncParentCompletion(tasks) {
      const byParent = new Map()
      for (const task of tasks) {
        if (!byParent.has(task.parentId || null)) byParent.set(task.parentId || null, [])
        byParent.get(task.parentId || null).push(task)
      }
      const visit = (task, depth) => {
        if (depth > 40) return Boolean(task.completed)
        const children = byParent.get(task.id) || []
        if (!children.length) return Boolean(task.completed)
        const complete = children.every((child) => visit(child, depth + 1))
        if (complete !== task.completed) {
          task.completed = complete
          task.completedAt = complete ? (task.completedAt || new Date().toISOString()) : null
        }
        return complete
      }
      for (const root of byParent.get(null) || []) visit(root, 0)
    }

    function descendantIds(tasks, id) {
      const ids = new Set([id])
      let changed = true
      while (changed) {
        changed = false
        for (const task of tasks) {
          if (task.parentId && ids.has(task.parentId) && !ids.has(task.id)) {
            ids.add(task.id)
            changed = true
          }
        }
      }
      return ids
    }

    // ---------------------------------------------------------------- overview

    function overviewFor(tasks, index) {
      const today = todayStr()
      const weekStart = startOfWeek(today)
      const weekEnd = addDays(weekStart, 6)
      const scoped = (start, end) => index.leaves.filter((task) => {
        const completedDate = task.completedAt ? String(task.completedAt).slice(0, 10) : ''
        return (task.dueDate && task.dueDate >= start && task.dueDate <= end)
          || (completedDate && completedDate >= start && completedDate <= end)
      })
      const summary = (rows) => {
        const done = rows.filter((task) => index.isDone(task)).length
        return { total: rows.length, done, percent: rows.length ? (done / rows.length) * 100 : 0 }
      }
      const todayRows = index.leaves.filter((task) => {
        const completedDate = task.completedAt ? String(task.completedAt).slice(0, 10) : ''
        return (task.dueDate && task.dueDate <= today && (!index.isDone(task) || task.dueDate === today))
          || completedDate === today
      })
      return {
        today: summary(todayRows),
        week: summary(scoped(weekStart, weekEnd))
      }
    }

    // -------------------------------------------------------------------- icons

    const ICON_PATHS = {
      check: [['path', { d: 'M5 12.5l4.2 4.2L19 6.8' }]],
      plus: [['path', { d: 'M12 5v14M5 12h14' }]],
      calendar: [
        ['rect', { x: 3.5, y: 5, width: 17, height: 15.5, rx: 2.5 }],
        ['path', { d: 'M8 3.5v4M16 3.5v4M3.5 10h17' }]
      ],
      chart: [
        ['path', { d: 'M4 20V10M10 20V4M16 20v-7M21 20H3' }]
      ],
      sync: [
        ['path', { d: 'M20 7v5h-5M4 17v-5h5' }],
        ['path', { d: 'M6.1 8.2A7 7 0 0118.7 7M17.9 15.8A7 7 0 015.3 17' }]
      ],
      flag: [['path', { d: 'M6 21V4c4-2.6 8 2.6 12 0v10c-4 2.6-8-2.6-12 0' }]],
      chevronRight: [['path', { d: 'M9 5l7 7-7 7' }]],
      chevronLeft: [['path', { d: 'M15 5l-7 7 7 7' }]],
      chevronDown: [['path', { d: 'M6 9l6 6 6-6' }]],
      trash: [
        ['path', { d: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5' }]
      ],
      x: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
      repeat: [
        ['path', { d: 'M17 2l3 3-3 3M3 11V9a4 4 0 014-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 01-4 4H4' }]
      ],
      list: [
        ['path', { d: 'M9 6h11M9 12h11M9 18h11' }],
        ['path', { d: 'M4.5 6h.01M4.5 12h.01M4.5 18h.01', 'stroke-width': 2.6 }]
      ],
      target: [
        ['circle', { cx: 12, cy: 12, r: 8.5 }],
        ['circle', { cx: 12, cy: 12, r: 4.5 }],
        ['circle', { cx: 12, cy: 12, r: 1, fill: 'currentColor', stroke: 'none' }]
      ],
      clock: [
        ['circle', { cx: 12, cy: 12, r: 8.5 }],
        ['path', { d: 'M12 7v5.2l3.4 2' }]
      ],
      note: [
        ['path', { d: 'M5 3.5h9l5 5v12H5z' }],
        ['path', { d: 'M14 3.5v5h5M8 13h8M8 17h5' }]
      ],
      arrowLeft: [['path', { d: 'M20 12H5M11 6l-6 6 6 6' }]],
      plug: [
        ['path', { d: 'M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0zM12 17v4' }]
      ],
      download: [['path', { d: 'M12 3v12M7 10l5 5 5-5M4 20h16' }]],
      upload: [['path', { d: 'M12 16V4M7 9l5-5 5 5M4 20h16' }]],
      refresh: [
        ['path', { d: 'M20 7v5h-5M4 17v-5h5' }],
        ['path', { d: 'M6.2 8.2A7 7 0 0118.8 7M17.8 15.8A7 7 0 015.2 17' }]
      ],
      more: [['path', { d: 'M5 12h.01M12 12h.01M19 12h.01', 'stroke-width': 2.8 }]],
      search: [
        ['circle', { cx: 10.8, cy: 10.8, r: 7 }],
        ['path', { d: 'M16 16l5 5' }]
      ],
      grip: [
        ['circle', { cx: 9, cy: 6, r: 1, fill: 'currentColor', stroke: 'none' }],
        ['circle', { cx: 15, cy: 6, r: 1, fill: 'currentColor', stroke: 'none' }],
        ['circle', { cx: 9, cy: 12, r: 1, fill: 'currentColor', stroke: 'none' }],
        ['circle', { cx: 15, cy: 12, r: 1, fill: 'currentColor', stroke: 'none' }],
        ['circle', { cx: 9, cy: 18, r: 1, fill: 'currentColor', stroke: 'none' }],
        ['circle', { cx: 15, cy: 18, r: 1, fill: 'currentColor', stroke: 'none' }]
      ],
      spark: [
        ['path', { d: 'M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z' }],
        ['path', { d: 'M18.5 16.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z' }]
      ]
    }

    function Icon({ name, size = 16, className }) {
      const paths = ICON_PATHS[name] || ICON_PATHS.list
      return h('svg', {
        className,
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true'
      }, paths.map(([tag, props], index) => h(tag, { key: index, ...props })))
    }

    function Ring({ percent, size = 42, stroke = 4, children }) {
      const radius = (size - stroke) / 2
      const circumference = 2 * Math.PI * radius
      const dash = (clampPercent(percent) / 100) * circumference
      return h('div', { className: 'dp-ring', style: { width: size, height: size } },
        h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
          h('circle', {
            cx: size / 2, cy: size / 2, r: radius, fill: 'none',
            stroke: 'var(--dsw-alias-bg-layer-2)', strokeWidth: stroke
          }),
          h('circle', {
            cx: size / 2, cy: size / 2, r: radius, fill: 'none',
            stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: stroke,
            strokeLinecap: 'round', strokeDasharray: `${dash} ${circumference}`,
            transform: `rotate(-90 ${size / 2} ${size / 2})`
          })
        ),
        children ? h('span', { className: 'dp-ring-text' }, children) : null
      )
    }

    // ---------------------------------------------------------------- data hook

    function usePlanner() {
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState('')
      const [saving, setSaving] = useState('idle')
      const [lastSaved, setLastSaved] = useState(0)
      const dataRef = useRef(null)
      const pendingRef = useRef([])
      const dirtyRef = useRef(false)
      const inFlightRef = useRef(false)
      const mountedRef = useRef(true)
      const loadingRef = useRef(false)
      const saveTimerRef = useRef(null)

      function applyRemote(next) {
        if (!next) return
        dataRef.current = next
        pendingRef.current = []
        dirtyRef.current = false
        setData(next)
        setLoading(false)
        setSaving('idle')
      }

      async function refresh(silent = false) {
        if (loadingRef.current) return
        loadingRef.current = true
        if (!silent && !dataRef.current) setLoading(true)
        try {
          const result = await api('state')
          if (!mountedRef.current) return
          if (!dirtyRef.current || !dataRef.current) {
            applyRemote(result.state)
          } else {
            const current = dataRef.current
            current.revision = result.state.revision
            current.integrations = result.state.integrations
            current.activities = result.state.activities
            current.dailyMetrics = result.state.dailyMetrics || current.dailyMetrics || []
            current.coach = result.state.coach || current.coach || null
            setData({ ...current })
          }
        } catch (nextError) {
          if (mountedRef.current && !silent) setError(nextError.message)
        } finally {
          loadingRef.current = false
          if (mountedRef.current && !dataRef.current) setLoading(false)
        }
      }

      function scheduleFlush(delay) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => { flush() }, delay)
      }

      async function flush() {
        if (!pendingRef.current.length || inFlightRef.current) return
        inFlightRef.current = true
        const batch = pendingRef.current.splice(0)
        setSaving('saving')
        try {
          const result = await api('ops', { method: 'POST', body: { ops: batch }, timeout: 30000 })
          if (!mountedRef.current) return
          if (!pendingRef.current.length) {
            applyRemote(result.state)
            setSaving('saved')
            setLastSaved(Date.now())
            setError('')
          } else {
            const current = dataRef.current
            if (current && result.state) {
              current.revision = result.state.revision
              current.integrations = result.state.integrations
              current.activities = result.state.activities
              current.updatedAt = result.state.updatedAt
              setData({ ...current })
            }
            setSaving('pending')
          }
        } catch (nextError) {
          pendingRef.current = [...batch, ...pendingRef.current]
          dirtyRef.current = true
          setSaving('error')
          if (mountedRef.current) setError(`保存失败：${nextError.message}`)
        } finally {
          inFlightRef.current = false
          if (pendingRef.current.length) {
            dirtyRef.current = true
            if (mountedRef.current) scheduleFlush(1200)
          } else {
            dirtyRef.current = false
            if (mountedRef.current) setSaving((value) => value === 'error' ? value : 'saved')
          }
        }
      }

      function commit(next, immediate = false, ops = []) {
        dataRef.current = next
        if (ops.length) pendingRef.current.push(...ops)
        dirtyRef.current = pendingRef.current.length > 0
        setData(next)
        setError('')
        if (dirtyRef.current) setSaving('pending')
        if (!dirtyRef.current) return
        if (immediate) {
          flush()
        } else {
          scheduleFlush(450)
        }
      }

      function mutate(fn, immediate = false, ops = []) {
        if (!dataRef.current) return
        const next = structuredClone(dataRef.current)
        fn(next)
        next.updatedAt = new Date().toISOString()
        commit(next, immediate, ops)
      }

      async function waitForSave() {
        if (dirtyRef.current && !inFlightRef.current) await flush()
        for (let i = 0; i < 50 && (inFlightRef.current || dirtyRef.current); i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 120))
        }
      }

      useEffect(() => {
        mountedRef.current = true
        refresh(false)
        const timer = setInterval(() => { refresh(true) }, 25000)
        return () => {
          mountedRef.current = false
          clearInterval(timer)
          clearTimeout(saveTimerRef.current)
        }
      }, [])

      function makeTask({ title, parentId = null, dueDate = '', notes = '', tags = [], priority = 2, startDate = '', category = 'other' }) {
        const now = new Date().toISOString()
        const tasks = dataRef.current?.tasks || []
        const parent = parentId ? tasks.find((task) => task.id === parentId) : null
        const siblings = tasks.filter((task) => (task.parentId || null) === (parent ? parent.id : null))
        const siblingOrders = siblings.map((task) => Number(task.order) || 0)
        return {
          id: newId('task'),
          title: String(title || '').trim().slice(0, 400),
          notes: String(notes || '').trim(),
          parentId: parent ? parent.id : null,
          dueDate: dueDate || parent?.dueDate || '',
          startDate: startDate || '',
          priority: Number(priority) >= 1 && Number(priority) <= 4 ? Number(priority) : 2,
          category: TASK_CATEGORY_MAP[category] ? category : (parent?.category || 'other'),
          tags: [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 12),
          completed: false,
          completedAt: null,
          mergedAt: '',
          createdAt: now,
          updatedAt: now,
          order: parent ? Math.max(-1, ...siblingOrders) + 1 : Math.min(0, ...siblingOrders) - 1,
          progress: { mode: 'check', current: 0, target: 1, unit: '' },
          autoSync: { enabled: false, sport: 'all', keyword: '' }
        }
      }

      function addTask(input) {
        const task = makeTask(input)
        if (!task.title) return null
        mutate((draft) => {
          draft.tasks.push(task)
          syncParentCompletion(draft.tasks)
        }, false, [{ type: 'addTask', task }])
        return task.id
      }

      function updateTask(id, patch) {
        mutate((draft) => {
          const task = draft.tasks.find((row) => row.id === id)
          if (!task) return
          if (patch.progress) {
            task.progress = { ...task.progress, ...patch.progress }
            const { current, target } = task.progress
            if (task.progress.mode !== 'check' && target > 0 && current >= target) {
              task.completed = true
              task.completedAt = task.completedAt || new Date().toISOString()
            } else if (task.progress.mode !== 'check' && current < target && task.completed) {
              task.completed = false
              task.completedAt = null
              task.mergedAt = ''
            }
          }
          for (const [key, value] of Object.entries(patch)) {
            if (key !== 'progress' && key !== 'id') task[key] = value
          }
          task.updatedAt = new Date().toISOString()
          syncParentCompletion(draft.tasks)
        }, false, [{ type: 'updateTask', id, patch }])
      }

      function toggleTask(id, done) {
        mutate((draft) => {
          const ids = descendantIds(draft.tasks, id)
          const now = new Date().toISOString()
          for (const task of draft.tasks) {
            if (!ids.has(task.id)) continue
            task.completed = done
            task.completedAt = done ? now : null
            if (done) {
              if (task.progress.mode === 'check') task.progress.current = 1
              else task.progress.current = Math.max(task.progress.current, task.progress.target)
            } else if (task.progress.mode === 'check') {
              task.progress.current = 0
            }
            if (!done) task.mergedAt = ''
            task.updatedAt = now
          }
          if (!done) {
            for (const task of draft.tasks) {
              if (ids.has(task.absorbedBy)) task.absorbedBy = ''
            }
          }
          syncParentCompletion(draft.tasks)
        }, true, [{ type: 'toggleTask', id, done }])
      }

      function deleteTask(id) {
        if (dataRef.current?.tasks?.find((task) => task.id === id)?.autoGenerated) return
        mutate((draft) => {
          const ids = descendantIds(draft.tasks, id)
          draft.tasks = draft.tasks.filter((task) => !ids.has(task.id))
          draft.reviews = draft.reviews || []
          syncParentCompletion(draft.tasks)
        }, true, [{ type: 'deleteTask', id }])
      }

      function saveReview(review) {
        const current = dataRef.current
        if (!current) return
        const existing = (current.reviews || []).find((row) => row.period === review.period && row.date === review.date)
        const row = existing
          ? { ...existing, ...review, id: existing.id, createdAt: existing.createdAt }
          : { ...review, id: newId('review'), createdAt: new Date().toISOString() }
        mutate((draft) => {
          draft.reviews = draft.reviews || []
          const index = draft.reviews.findIndex((item) => item.id === row.id)
          if (index >= 0) draft.reviews[index] = row
          else draft.reviews.unshift(row)
        }, true, [{ type: 'saveReview', review: row }])
      }

      function setAutoSync(enabled) {
        mutate((draft) => {
          draft.integrations.coros.autoSync = enabled
        }, true, [{ type: 'autoSync', enabled }])
      }

      function setAutoCreate(enabled) {
        mutate((draft) => {
          draft.integrations.coros.autoCreateTasks = enabled
        }, true, [{ type: 'autoCreate', enabled }])
      }

      function mergeBall(id, sourceTaskId = '') {
        mutate((draft) => {
          const task = draft.tasks.find((row) => row.id === id)
          if (!task) return
          const source = sourceTaskId ? draft.tasks.find((row) => row.id === sourceTaskId) : null
          if (source && source.id !== task.id && source.actual) task.actual = source.actual
          if (source && source.id !== task.id) source.absorbedBy = task.id
          task.completed = true
          task.completedAt = task.completedAt || new Date().toISOString()
          if (task.progress.mode === 'check') task.progress.current = 1
          else task.progress.current = Math.max(task.progress.current, task.progress.target)
          task.mergedAt = new Date().toISOString()
          task.updatedAt = new Date().toISOString()
        }, false, [{ type: 'mergeBall', id, merged: true, sourceTaskId }])
      }

      function reorderTasks(sourceId, targetId) {        if (!dataRef.current || sourceId === targetId) return
        const roots = dataRef.current.tasks.filter((task) => !task.parentId).sort(sortTasks)
        const ids = roots.map((task) => task.id)
        const from = ids.indexOf(sourceId)
        const to = ids.indexOf(targetId)
        if (from < 0 || to < 0) return
        ids.splice(to, 0, ids.splice(from, 1)[0])
        mutate((draft) => {
          const position = new Map(ids.map((id, index) => [id, index]))
          for (const task of draft.tasks) {
            if (!task.parentId && position.has(task.id)) task.order = position.get(task.id)
          }
        }, false, [{ type: 'reorderTasks', ids }])
      }

      async function connectCoros(payload) {
        await waitForSave()
        const result = await api('connect', { method: 'POST', body: payload, timeout: 90000 })
        if (result.state) applyRemote(result.state)
        return result
      }

      async function disconnectCoros() {
        const result = await api('disconnect', { method: 'POST', body: {}, timeout: 30000 })
        if (result.state) applyRemote(result.state)
        return result
      }

      async function syncNow() {
        await waitForSave()
        const result = await api('sync', { method: 'POST', body: { days: 30 }, timeout: 90000 })
        if (result.state) applyRemote(result.state)
        return result
      }

      async function importActivities(activities) {
        await waitForSave()
        const result = await api('import', { method: 'POST', body: { activities }, timeout: 30000 })
        if (result.state) applyRemote(result.state)
        return result
      }

      async function exportData() {
        await waitForSave()
        const result = await api('export', { timeout: 30000 })
        const blob = new Blob([JSON.stringify({
          exportedAt: result.exportedAt,
          version: result.version,
          tasks: result.tasks,
          reviews: result.reviews,
          activities: result.activities,
          dailyMetrics: result.dailyMetrics || []
        }, null, 2)], { type: 'application/json;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `dsh-rundiag-${todayStr()}.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        return result
      }

      return {
        data,
        loading,
        error,
        saving,
        lastSaved,
        refresh,
        addTask,
        updateTask,
        toggleTask,
        deleteTask,
        saveReview,
        setAutoSync,
        setAutoCreate,
        mergeBall,
        reorderTasks,
        connectCoros,
        disconnectCoros,
        syncNow,
        importActivities,
        exportData,
        setError
      }
    }

    // --------------------------------------------------------------- components

    function CheckButton({ done, onClick, label = '切换完成状态', size = 18, disabled = false }) {
      return h('button', {
        type: 'button',
        className: `dp-check${done ? ' is-done' : ''}`,
        style: { width: size, height: size, borderRadius: Math.max(5, size / 3) },
        onClick: (event) => { event.stopPropagation(); if (!disabled) onClick() },
        disabled,
        'aria-label': label,
        'aria-pressed': Boolean(done)
      }, done ? h(Icon, { name: 'check', size: Math.max(11, size - 6) }) : null)
    }

    function Bar({ percent, className = '' }) {
      return h('div', { className: `dp-bar ${className}` },
        h('span', { style: { width: `${clampPercent(percent)}%` } }))
    }

    function Avatar({ label, size = 24 }) {
      return h('span', { className: 'dp-avatar', style: { width: size, height: size } }, label)
    }

    function parseQuickAdd(raw) {
      let text = String(raw || '').replace(/\s+/g, ' ').trim()
      const tags = []
      const tagPattern = /[#＃]([^\s#＃，,;；]{1,32})/g
      for (const match of text.matchAll(tagPattern)) tags.push(match[1])
      text = text.replace(tagPattern, ' ')
      let priority = 2
      text = text.replace(/[!！](高|中|低|无|[1-4])/g, (_, value) => {
        priority = ({ 高: 1, 中: 2, 低: 3, 无: 4 })[value] || Number(value) || 2
        return ' '
      })
      let dueDate = ''
      const iso = text.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/)
      if (iso) {
        dueDate = iso[1]
        text = text.replace(iso[0], ' ')
      }
      const monthDay = text.match(/(\d{1,2})月(\d{1,2})日/)
      if (!dueDate && monthDay) {
        const year = Number(todayStr().slice(0, 4))
        const candidate = `${year}-${String(monthDay[1]).padStart(2, '0')}-${String(monthDay[2]).padStart(2, '0')}`
        dueDate = candidate < todayStr()
          ? `${year + 1}-${candidate.slice(5)}`
          : candidate
        text = text.replace(monthDay[0], ' ')
      }
      const relative = text.match(/(大后天|后天|明天|今天)/)
      if (!dueDate && relative) {
        dueDate = addDays(todayStr(), { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 }[relative[1]])
        text = text.replace(relative[0], ' ')
      }
      const weekday = text.match(/(?:周|星期)([一二三四五六日天])/)
      if (!dueDate && weekday) {
        const target = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[weekday[1]]
        const base = parseDate(todayStr())
        const current = base.getDay() || 7
        dueDate = addDays(todayStr(), (target - current + 7) % 7)
        text = text.replace(weekday[0], ' ')
      }
      return {
        title: text.replace(/\s+/g, ' ').trim(),
        tags: [...new Set(tags)].slice(0, 8),
        priority,
        dueDate
      }
    }

    function AddComposer({ onAdd, placeholder = '添加任务，支持 #标签、明天、!高…', defaultCategory = 'other' }) {
      const [value, setValue] = useState('')
      const [category, setCategory] = useState(defaultCategory)
      const inputRef = useRef(null)
      const parsed = useMemo(() => parseQuickAdd(value), [value])
      const hasMeta = Boolean(parsed.dueDate || parsed.tags.length || parsed.priority !== 2)
      function submit(event) {
        event.preventDefault()
        if (!parsed.title) return
        onAdd({ ...parsed, category })
        setValue('')
        inputRef.current?.focus()
      }
      return h('form', { className: 'dp-composer-wrap', onSubmit: submit },
        h('div', { className: 'dp-composer' },
          h(Icon, { name: 'plus', size: 15, className: 'dp-composer-icon' }),
          h('input', {
            ref: inputRef,
            value,
            onChange: (event) => setValue(event.target.value),
            placeholder,
            'aria-label': '新任务标题'
          }),
          parsed.title ? h('button', { type: 'submit', className: 'dp-btn dp-btn-primary dp-btn-small' }, '添加') : null
        ),
        h('div', { className: 'dp-category-row', role: 'group', 'aria-label': '任务类型' },
          TASK_CATEGORIES.map(([id, label, glyph]) => h('button', {
            type: 'button',
            key: id,
            className: `dp-category${category === id ? ' is-active' : ''}`,
            onClick: () => setCategory(id),
            title: `标记为${label}任务`,
            'aria-pressed': category === id
          }, h('span', { className: `dp-category-glyph is-${id}` }, glyph), label))
        ),
        hasMeta ? h('div', { className: 'dp-quick-preview' },
          parsed.dueDate ? h('span', { className: 'dp-quick-chip' }, h(Icon, { name: 'calendar', size: 10 }), dateLabel(parsed.dueDate)) : null,
          parsed.priority !== 2 ? h('span', { className: 'dp-quick-chip' }, `${PRIORITY_LABELS[parsed.priority]}优先级`) : null,
          parsed.tags.map((tag) => h('span', { className: 'dp-quick-chip', key: tag }, `#${tag}`))
        ) : h('div', { className: 'dp-composer-hint' }, '先选类型，再生成同色能量球；只有同类型才能合并。')
      )
    }

    function EmptyState({ icon = 'spark', title, text, action }) {
      return h('div', { className: 'dp-empty' },
        h('span', { className: 'dp-empty-icon' }, h(Icon, { name: icon, size: 22 })),
        h('p', { className: 'dp-empty-title' }, title),
        text ? h('p', { className: 'dp-empty-text' }, text) : null,
        action ? h('div', { className: 'dp-empty-action' }, action) : null
      )
    }

    // ------------------------------------------------------------------ task row

    function TaskRow({
      task, index, onOpen, onToggle, onAddSubtask,
      expanded, onExpand, draggable, onDragStart, onDragOver, onDrop, isDragOver
    }) {
      const [subDraft, setSubDraft] = useState('')
      const done = index.isDone(task)
      const progress = index.progress(task)
      const children = index.childrenOf(task.id)
      const overdue = !done && isOverdue(task.dueDate)
      const mode = task.progress?.mode || 'check'
      const showProgress = mode !== 'check' && !children.length

      function submitSubtask(event) {
        event.preventDefault()
        event.stopPropagation()
        const title = subDraft.trim()
        if (!title) return
        onAddSubtask(task.id, title)
        setSubDraft('')
      }

      return h('div', {
        className: `dp-task-wrap${expanded ? ' is-expanded' : ''}${isDragOver ? ' is-drag-over' : ''}`,
        draggable: Boolean(draggable),
        onDragStart: onDragStart,
        onDragOver,
        onDrop
      },
        h('div', {
          className: `dp-task${done ? ' is-done' : ''}`,
          onClick: () => onOpen(task.id),
          onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(task.id) } },
          role: 'button',
          tabIndex: 0,
          title: draggable ? '拖动可排序' : undefined
        },
          h(CheckButton, { done, onClick: () => onToggle(task.id, !done), size: 19 }),
          h('div', { className: 'dp-task-mid' },
            h('div', { className: 'dp-task-title' }, task.title),
            h('div', { className: 'dp-task-meta' },
              task.dueDate ? h('span', { className: `dp-chip${overdue ? ' is-danger' : ''}` },
                h(Icon, { name: 'calendar', size: 11 }),
                dateLabel(task.dueDate)
              ) : null,
              children.length ? h('span', { className: 'dp-chip' },
                h(Icon, { name: 'list', size: 11 }),
                progress.label
              ) : null,
              showProgress ? h('span', { className: 'dp-chip' },
                h(Icon, { name: 'target', size: 11 }),
                progress.label
              ) : null,
              task.autoSync?.enabled ? h('span', { className: 'dp-chip dp-chip-sync', title: '已开启自动同步' },
                h(Icon, { name: 'sync', size: 11 }),
                '同步'
              ) : null,
              (task.tags || []).slice(0, 2).map((tag) => h('span', { className: 'dp-tag', key: tag }, tag)),
              (task.tags || []).length > 2 ? h('span', { className: 'dp-tag' }, `+${task.tags.length - 2}`) : null
            ),
            showProgress && progress.current > 0 ? h(Bar, { percent: progress.percent, className: 'dp-bar-task' }) : null
          ),
          h('span', { className: `dp-priority p${task.priority || 4}`, title: `${PRIORITY_LABELS[task.priority] || '无'}优先级` }),
          h('button', {
            type: 'button',
            className: 'dp-expand',
            title: expanded ? '收起子任务' : children.length ? '展开子任务' : '添加子任务',
            'aria-expanded': Boolean(expanded),
            'aria-label': expanded ? '收起子任务' : children.length ? '展开子任务' : '添加子任务',
            onClick: (event) => { event.stopPropagation(); onExpand(task.id) }
          }, h(Icon, { name: expanded ? 'chevronDown' : children.length ? 'chevronRight' : 'plus', size: 14 })),
          draggable ? h(Icon, { name: 'grip', size: 14, className: 'dp-task-grip' }) : null
        ),
        expanded ? h('div', { className: 'dp-inline-panel', onClick: (event) => event.stopPropagation() },
          children.length ? h('div', { className: 'dp-inline-subrows' },
            children.map((child) => {
              const childDone = index.isDone(child)
              return h('div', { className: 'dp-inline-sub', key: child.id },
                h(CheckButton, { done: childDone, onClick: () => onToggle(child.id, !childDone), size: 16 }),
                h('button', {
                  type: 'button',
                  className: `dp-inline-sub-title${childDone ? ' is-done' : ''}`,
                  onClick: () => onOpen(child.id)
                }, child.title),
                child.dueDate ? h('span', { className: 'dp-inline-sub-date' }, shortDate(child.dueDate)) : null
              )
            })
          ) : null,
          h('form', { className: 'dp-inline-add', onSubmit: submitSubtask },
            h(Icon, { name: 'plus', size: 12 }),
            h('input', {
              value: subDraft,
              onChange: (event) => setSubDraft(event.target.value),
              placeholder: '添加子任务…',
              'aria-label': '添加子任务'
            }),
            subDraft.trim() ? h('button', { type: 'submit', className: 'dp-btn dp-btn-small' }, '添加') : null
          )
        ) : null
      )
    }

    function parseTags(value) {
      return [...new Set(String(value).split(/[,，;；\s]+/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 12)
    }

    function defaultUnit(mode) {
      if (mode === 'distance') return 'km'
      if (mode === 'duration') return '分钟'
      if (mode === 'count') return '次'
      return ''
    }

    function SyncView({ data, onConnect, onDisconnect, onSync, onToggleAuto, onToggleAutoCreate, onImport }) {
      const coros = data.integrations.coros
      const connected = coros.connected
      const [region, setRegion] = useState(coros.region || 'cn')
      const [mode, setMode] = useState(/^[+\d]/.test(String(coros.account || '')) ? 'phone' : 'password')
      const [email, setEmail] = useState(coros.account || '')
      const [password, setPassword] = useState('')
      const [token, setToken] = useState('')
      const [busy, setBusy] = useState('')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [confirmDisconnect, setConfirmDisconnect] = useState(false)
      const [showConnect, setShowConnect] = useState(!connected)
      const [importText, setImportText] = useState('')
      const [importOpen, setImportOpen] = useState(false)

      useEffect(() => {
        setRegion(coros.region || 'cn')
        setEmail(coros.account || '')
        if (coros.account) setMode(/^[+\d]/.test(String(coros.account)) ? 'phone' : 'password')
        setShowConnect(!coros.connected)
      }, [coros.connected, coros.region, coros.account])

      async function run(label, fn, success) {
        setBusy(label)
        setError('')
        setNotice('')
        try {
          const result = await fn()
          setNotice(success(result))
          return result
        } catch (nextError) {
          setError(nextError.message)
          return null
        } finally {
          setBusy('')
        }
      }

      async function connect(event) {
        event.preventDefault()
        await run('connect', () => onConnect({
          region,
          email,
          account: email,
          loginMode: mode,
          password,
          token: mode === 'token' ? token : ''
        }), (result) => result?.syncError
          ? `已连接，但首次同步失败：${result.syncError}`
          : '已连接 COROS，最近 30 天的活动已读取。')
        setPassword('')
        setToken('')
      }

      async function sync() {
        await run('sync', () => onSync(), (result) => {
          const fetched = result?.result?.fetched ?? 0
          const matched = result?.result?.matched ?? 0
          const auto = result?.result?.autoTasks || {}
          const filled = []
          if (auto.created) filled.push(`新增 ${auto.created} 个今日任务`)
          if (auto.updated) filled.push(`更新 ${auto.updated} 个今日任务`)
          return `同步完成：读取 ${fetched} 条活动，更新 ${matched} 个任务进度${filled.length ? `，${filled.join('、')}` : ''}。`
        })
      }

      async function disconnect() {
        await run('disconnect', () => onDisconnect(), () => '已断开 COROS。')
        setConfirmDisconnect(false)
        setShowConnect(true)
      }

      async function importNow() {
        let rows
        try {
          const parsed = JSON.parse(importText)
          rows = Array.isArray(parsed) ? parsed : parsed?.activities
        } catch {
          setError('JSON 解析失败，请检查格式。')
          return
        }
        if (!Array.isArray(rows) || !rows.length) {
          setError('请提供活动数组，至少包含 date 字段。')
          return
        }
        await run('import', () => onImport(rows), (result) => `已导入 ${result?.result?.imported ?? rows.length} 条活动。`)
        setImportText('')
        setImportOpen(false)
      }

      const taskName = (id) => data.tasks.find((task) => task.id === id)?.title || ''
      const activities = data.activities.slice(0, 12)

      return h('div', { className: 'dp-sync' },
        h('div', { className: 'dp-sync-hero' },
          h('span', { className: `dp-sync-logo${connected ? ' is-connected' : ''}` }, h(Icon, { name: 'plug', size: 22 })),
          h('div', null,
            h('h2', null, '数据同步'),
            h('p', null, connected
              ? `COROS 已连接 · ${coros.autoCreateTasks !== false ? '自动补齐今日任务 · ' : ''}每 10 分钟自动同步`
              : '连接 COROS，让运动数据推动任务进度')
          ),
          h('span', { className: `dp-status-dot${connected ? ' is-on' : ''}` })
        ),

        error ? h('div', { className: 'dp-alert is-error' }, h(Icon, { name: 'x', size: 13 }), h('span', null, error)) : null,
        notice ? h('div', { className: 'dp-alert is-success' }, h(Icon, { name: 'check', size: 13 }), h('span', null, notice)) : null,
        coros.lastSyncError ? h('div', { className: 'dp-alert is-warn' },
          h(Icon, { name: 'sync', size: 13 }),
          h('span', null, `上次同步：${coros.lastSyncError}`)
        ) : null,

        connected && !showConnect ? h('div', { className: 'dp-conn-card' },
          h('div', { className: 'dp-conn-head' },
            h('div', null,
              h('div', { className: 'dp-conn-account' }, coros.account || 'COROS 账号'),
              h('div', { className: 'dp-muted' }, `${REGION_LABELS[coros.region] || coros.region} · 上次同步 ${timeAgo(coros.lastSyncAt)}`)
            ),
            h('div', { className: 'dp-toggle-stack' },
              h('label', { className: 'dp-toggle-row dp-toggle-inline' },
                h('span', { className: 'dp-muted' }, '自动同步'),
                h('input', {
                  type: 'checkbox',
                  className: 'dp-switch',
                  checked: Boolean(coros.autoSync),
                  disabled: Boolean(busy),
                  onChange: (event) => onToggleAuto(event.target.checked)
                })
              ),
              h('label', {
                className: 'dp-toggle-row dp-toggle-inline',
                title: '识别到今天的 COROS 活动时，自动生成一条已完成的今日任务'
              },
                h('span', { className: 'dp-muted' }, '补齐今日'),
                h('input', {
                  type: 'checkbox',
                  className: 'dp-switch',
                  checked: coros.autoCreateTasks !== false,
                  disabled: Boolean(busy),
                  onChange: (event) => onToggleAutoCreate(event.target.checked)
                })
              )
            )
          ),
          h('p', { className: 'dp-hint dp-auto-hint' },
            coros.autoCreateTasks !== false
              ? '今天的活动会自动汇总成一条已完成任务，同一种运动每天只保留一条；手动关联过的活动不会重复生成。'
              : '开启“补齐今日”后，今天的活动会自动汇总为已完成任务，便于直接纳入今日复盘。'),
          h('div', { className: 'dp-conn-actions' },
            h('button', { type: 'button', className: 'dp-btn dp-btn-primary', onClick: sync, disabled: Boolean(busy) },
              h(Icon, { name: 'sync', size: 14, className: busy === 'sync' ? 'dp-spin' : '' }),
              busy === 'sync' ? '同步中…' : '立即同步'
            ),
            h('button', { type: 'button', className: 'dp-btn', onClick: () => setShowConnect(true) }, '更换账号'),
            confirmDisconnect
              ? h('div', { className: 'dp-inline-confirm' },
                h('span', null, '断开？'),
                h('button', { type: 'button', className: 'dp-btn dp-btn-danger dp-btn-small', onClick: disconnect, disabled: Boolean(busy) }, '确认'),
                h('button', { type: 'button', className: 'dp-btn dp-btn-small', onClick: () => setConfirmDisconnect(false) }, '取消')
              )
              : h('button', { type: 'button', className: 'dp-link-btn dp-danger-text', onClick: () => setConfirmDisconnect(true) }, '断开连接')
          )
        ) : null,

        (!connected || showConnect) ? h('form', { className: 'dp-conn-form', onSubmit: connect },
          h('div', { className: 'dp-conn-form-head' },
            h('span', { className: 'dp-label' }, connected ? '重新连接 COROS' : '连接 COROS'),
            connected ? h('button', { type: 'button', className: 'dp-link-btn', onClick: () => setShowConnect(false) }, '收起') : null
          ),
          h('div', { className: 'dp-form-grid' },
            h('label', { className: 'dp-field' }, h('span', null, '账号区域'),
              h('select', { value: region, onChange: (event) => setRegion(event.target.value) },
                Object.entries(REGION_LABELS).map(([value, label]) => h('option', { value, key: value }, label))
              )
            ),
            h('div', { className: 'dp-field' },
              h('span', null, '登录方式'),
              h('div', { className: 'dp-segmented dp-segmented-small dp-login-modes' },
                h('button', { type: 'button', className: mode === 'password' ? 'is-active' : '', onClick: () => setMode('password') }, '邮箱'),
                h('button', { type: 'button', className: mode === 'phone' ? 'is-active' : '', onClick: () => setMode('phone') }, '手机号'),
                h('button', { type: 'button', className: mode === 'token' ? 'is-active' : '', onClick: () => setMode('token') }, 'Token')
              )
            )
          ),
          mode !== 'token' ? h('div', { className: 'dp-form-grid' },
            h('label', { className: 'dp-field dp-field-wide' }, h('span', null, mode === 'phone' ? 'COROS 手机号' : 'COROS 邮箱'),
              h('input', {
                type: mode === 'phone' ? 'tel' : 'email',
                inputMode: mode === 'phone' ? 'tel' : 'email',
                value: email,
                autoComplete: 'username',
                placeholder: mode === 'phone' ? '例如 13800138000' : 'you@example.com',
                onChange: (event) => setEmail(mode === 'phone' ? event.target.value.replace(/[^\d+]/g, '') : event.target.value)
              })
            ),
            h('label', { className: 'dp-field dp-field-wide' }, h('span', null, '密码'),
              h('input', {
                type: 'password', value: password, autoComplete: 'current-password',
                placeholder: '仅用于登录，不会保存密码',
                onChange: (event) => setPassword(event.target.value)
              })
            )
          ) : h('label', { className: 'dp-field dp-field-wide' }, h('span', null, 'accessToken'),
            h('textarea', {
              className: 'dp-textarea dp-token-input',
              rows: 2,
              value: token,
              placeholder: '粘贴 COROS accessToken；仅保存在本机配置中',
              onChange: (event) => setToken(event.target.value)
            })
          ),
          h('div', { className: 'dp-form-actions' },
            h('button', { type: 'submit', className: 'dp-btn dp-btn-primary', disabled: Boolean(busy) },
              busy === 'connect' ? '连接中…' : connected ? '保存并同步' : '连接并同步'
            )
          ),
          h('p', { className: 'dp-hint' }, '邮箱和手机号共用同一密码入口，使用 COROS Training Hub 官方登录接口；请求只发送到对应区域服务器。Token 保存在 DSH 本机 profile，不会回传到浏览器，密码不会保存。')
        ) : null,

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' },
            h(Icon, { name: 'chart', size: 13 }),
            `最近活动${activities.length ? ` · ${activities.length}` : ''}`
          ),
          activities.length ? h('div', { className: 'dp-activity-list' },
            activities.map((activity) => {
              const matched = (activity.matchedTaskIds || []).map(taskName).filter(Boolean)
              return h('div', { className: 'dp-activity', key: activity.id },
                h('span', { className: `dp-sport dp-sport-${activity.sport}` }, h(Icon, { name: activity.sport === 'bike' || activity.sport === 'indoorBike' ? 'repeat' : 'target', size: 13 })),
                h('div', { className: 'dp-activity-mid' },
                  h('div', { className: 'dp-activity-title' }, activity.name || '运动'),
                  h('div', { className: 'dp-activity-meta' },
                    `${shortDate(activity.date)} · ${SPORT_LABELS[activity.sport] || '运动'}`,
                    activity.distanceKm ? ` · ${round(activity.distanceKm, 2)} km` : '',
                    activity.durationMin ? ` · ${round(activity.durationMin)} 分钟` : ''
                  )
                ),
                matched.length
                  ? h('span', { className: 'dp-activity-match', title: matched.join('、') }, `→ ${matched[0]}${matched.length > 1 ? ` +${matched.length - 1}` : ''}`)
                  : h('span', { className: 'dp-muted dp-activity-raw' }, '未匹配')
              )
            })
          ) : h('p', { className: 'dp-hint' }, connected ? '最近 30 天没有读到活动，点“立即同步”再试一次。' : '连接后，最近 30 天的活动会出现在这里。')
        ),

        h('div', { className: 'dp-section' },
          h('button', { type: 'button', className: 'dp-disclosure', onClick: () => setImportOpen((value) => !value) },
            h(Icon, { name: importOpen ? 'chevronDown' : 'chevronRight', size: 13 }),
            h('span', null, '手动导入活动'),
            h('span', { className: 'dp-muted' }, '备用')
          ),
          importOpen ? h('div', { className: 'dp-import' },
            h('p', { className: 'dp-hint' }, '支持 JSON 数组，最少包含 date；可选 sport、name、distanceKm、durationMin。'),
            h('textarea', {
              className: 'dp-textarea dp-json-input',
              rows: 5,
              value: importText,
              placeholder: '[{ "date": "2026-11-20", "sport": "run", "name": "晨跑", "distanceKm": 5.2, "durationMin": 31 }]',
              onChange: (event) => setImportText(event.target.value)
            }),
            h('div', { className: 'dp-form-actions' },
              h('button', { type: 'button', className: 'dp-btn', onClick: importNow, disabled: Boolean(busy) || !importText.trim() },
                busy === 'import' ? '导入中…' : '导入并匹配'
              )
            )
          ) : null
        )
      )
    }

    function rootsOnDate(tasks, index, date) {
      const today = todayStr()
      return index.roots.filter((task) => {
        if (task.parentId) return false
        const bounds = index.dateBounds(task)
        const completedDate = task.completedAt ? String(task.completedAt).slice(0, 10) : ''
        if (!bounds.start && !bounds.end) return date === today && !index.isDone(task)
        if (bounds.start && bounds.start <= date && date <= bounds.end) return true
        if (completedDate === date) return true
        return date === today && !index.isDone(task) && Boolean(bounds.start) && bounds.start < today
      }).sort(sortTasks)
    }

    function dayStats(tasks, index, date) {
      const rows = rootsOnDate(tasks, index, date)
      const done = rows.filter((task) => index.isDone(task)).length
      return { total: rows.length, done, percent: rows.length ? (done / rows.length) * 100 : 0 }
    }

    function coachDayFor(coach, date) {
      if (!coach?.days) return null
      return coach.days.find((day) => day.date === date) || null
    }

    function ballTone(task) {
      return categoryOf(task).tone
    }

    function ballGlyph(task) {
      if (task?.autoGenerated) {
        const sport = task?.sourceSport || task?.autoSync?.sport || ''
        if (sport === 'run' || sport === 'trailRun') return '跑'
        if (sport === 'bike' || sport === 'indoorBike') return '骑'
        if (sport === 'poolSwim' || sport === 'openWater') return '泳'
        if (sport === 'strength') return '力'
        if (sport === 'walk' || sport === 'hike') return '走'
      }
      return categoryOf(task).glyph
    }

    function seedPosition(task, kind, slot) {
      let hash = 0
      const text = `${task.id}:${kind}`
      for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
      const column = slot % 4
      const row = Math.floor(slot / 4) % 3
      if (kind === 'actual') return { x: 61 + column * 7 + (hash % 7), y: 26 + row * 22 }
      if (kind === 'green') return { x: 50, y: 48 }
      return { x: 18 + column * 12 + (hash % 8), y: 24 + row * 23 }
    }

    function DateRail({ date, onSelect, tasks, index, reviews }) {
      const weekStart = startOfWeek(date)
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      const reviewDates = new Set((reviews || []).filter((row) => row.period === 'day').map((row) => row.date))
      return h('div', { className: 'dp-daterail' },
        h('div', { className: 'dp-week-nav' },
          h('button', {
            type: 'button', className: 'dp-week-arrow', 'aria-label': '上一周',
            onClick: () => onSelect(addDays(date, -7))
          }, h(Icon, { name: 'chevronLeft', size: 13 })),
          h('button', {
            type: 'button', className: 'dp-week-title',
            onClick: () => onSelect(todayStr()), title: '回到今天'
          }, `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`),
          h('button', {
            type: 'button', className: 'dp-week-arrow', 'aria-label': '下一周',
            onClick: () => onSelect(addDays(date, 7))
          }, h(Icon, { name: 'chevronRight', size: 13 }))
        ),
        h('div', { className: 'dp-week-days', role: 'tablist', 'aria-label': '选择日期' },
          days.map((day) => {
            const stats = dayStats(tasks, index, day)
            const active = day === date
            const isToday = day === todayStr()
            return h('button', {
              type: 'button',
              role: 'tab',
              key: day,
              className: `dp-day${active ? ' is-active' : ''}${isToday ? ' is-today' : ''}${day < todayStr() ? ' is-past' : ''}`,
              'aria-selected': active,
              onClick: () => onSelect(day),
              title: `${dateLabel(day)} · ${stats.done}/${stats.total} 完成`
            },
              h('span', { className: 'dp-day-wd' }, weekday(day)),
              h('span', { className: 'dp-day-num' }, String(Number(day.slice(8, 10)))),
              h('span', { className: 'dp-day-dots' },
                stats.total ? Array.from({ length: Math.min(3, stats.total) }, (_, i) => h('i', {
                  key: i,
                  className: i < Math.min(3, stats.done) ? 'is-done' : ''
                })) : reviewDates.has(day) ? h('i', { className: 'is-review' }) : null
              )
            )
          })
        )
      )
    }

    function ballActual(task) {
      const actual = task.actual || {}
      const progress = task.progress || {}
      return {
        distance: Number(actual.distanceKm) || (progress.mode === 'distance' ? Number(progress.current) || 0 : 0),
        duration: Number(actual.durationMin) || (progress.mode === 'duration' ? Number(progress.current) || 0 : 0),
        sport: actual.sport || task.sourceSport || (task.autoSync?.sport && task.autoSync.sport !== 'all' ? task.autoSync.sport : ''),
        tags: Array.isArray(task.tags) ? task.tags : [],
        avgHr: Number(actual.avgHr) || 0,
        calories: Number(actual.calories) || 0,
        load: Number(actual.trainingLoad) || 0
      }
    }

    function ballPlan(task) {
      const progress = task.progress || {}
      return {
        distance: progress.mode === 'distance' ? Number(progress.target) || 0 : 0,
        duration: progress.mode === 'duration' ? Number(progress.target) || 0 : 0,
        sport: task.autoSync?.sport && task.autoSync.sport !== 'all' ? task.autoSync.sport : (task.sourceSport || ''),
        tags: Array.isArray(task.tags) ? task.tags : []
      }
    }

    function canMergeBalls(planTask, actualTask) {
      if (planTask.id === actualTask.id) return true
      const plan = ballPlan(planTask)
      const actual = ballActual(actualTask)
      const sameCategory = categoryOf(planTask).id === categoryOf(actualTask).id
      const sameSport = Boolean(plan.sport && actual.sport && plan.sport === actual.sport)
      const closeDistance = plan.distance > 0 && actual.distance > 0
        && Math.abs(plan.distance - actual.distance) <= Math.max(0.8, plan.distance * 0.2)
      const closeDuration = plan.duration > 0 && actual.duration > 0
        && Math.abs(plan.duration - actual.duration) <= Math.max(6, plan.duration * 0.2)
      const sharedTag = plan.tags.some((tag) => actual.tags.includes(tag))
      if (sameCategory && (sameSport || closeDistance || closeDuration || sharedTag)) return true
      return sameSport && (closeDistance || closeDuration || sharedTag)
    }

    function ballMeta(task) {
      const actual = task.actual || {}
      const parts = []
      if (actual.distanceKm) parts.push(`${round(actual.distanceKm, 2)} km`)
      if (actual.durationMin) parts.push(`${round(actual.durationMin)} 分钟`)
      if (actual.avgHr) parts.push(`${actual.avgHr} bpm`)
      if (actual.calories) parts.push(`${actual.calories} kcal`)
      if (actual.trainingLoad) parts.push(`负荷 ${actual.trainingLoad}`)
      if (actual.elevationGain) parts.push(`爬升 ${actual.elevationGain} m`)
      return parts.join(' · ')
    }

    function BallField({ date, tasks, index, onMerge, onOpen }) {
      const [positions, setPositions] = useState({})
      const [drag, setDrag] = useState(null)
      const [mergeFx, setMergeFx] = useState(null)
      const positionsRef = useRef({})
      const dragRef = useRef(null)
      const rafRef = useRef(0)
      const fieldRef = useRef(null)
      const movedRef = useRef(false)
      const rows = rootsOnDate(tasks, index, date)
      const balls = []
      rows.forEach((task) => {
        if (task.absorbedBy) return
        const done = index.isDone(task)
        if (done && task.mergedAt) {
          balls.push({ key: `${task.id}:green`, kind: 'green', task })
          return
        }
        if (!task.autoGenerated) balls.push({ key: `${task.id}:plan`, kind: 'plan', task })
        if (done) balls.push({ key: `${task.id}:actual`, kind: 'actual', task })
      })

      function commitPositions(next) {
        positionsRef.current = next
        setPositions(next)
      }

      function setBallPosition(key, patch) {
        const current = positionsRef.current[key]
        if (!current) return
        commitPositions({ ...positionsRef.current, [key]: { ...current, ...patch } })
      }

      function stopInertia() {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }

      function startInertia(key) {
        stopInertia()
        const frame = () => {
          const current = positionsRef.current[key]
          if (!current) return
          let vx = (current.vx || 0) * 0.94
          let vy = (current.vy || 0) * 0.94
          let x = current.x + vx * 0.016
          let y = current.y + vy * 0.016
          if (x < 7) { x = 7; vx = Math.abs(vx) * 0.58 }
          if (x > 93) { x = 93; vx = -Math.abs(vx) * 0.58 }
          if (y < 11) { y = 11; vy = Math.abs(vy) * 0.58 }
          if (y > 87) { y = 87; vy = -Math.abs(vy) * 0.58 }
          const stretchX = 1 + Math.min(0.2, Math.abs(vx) / 210)
          const stretchY = 1 - Math.min(0.14, Math.abs(vx) / 420)
          commitPositions({
            ...positionsRef.current,
            [key]: { ...current, x, y, vx, vy, sx: stretchX, sy: stretchY }
          })
          if (Math.hypot(vx, vy) > 0.12) {
            rafRef.current = requestAnimationFrame(frame)
          } else {
            setBallPosition(key, { vx: 0, vy: 0, sx: 1, sy: 1 })
            rafRef.current = 0
          }
        }
        rafRef.current = requestAnimationFrame(frame)
      }

      useEffect(() => {
        commitPositions({})
        setDrag(null)
        setMergeFx(null)
        stopInertia()
        return stopInertia
      }, [date])
      useEffect(() => {
        if (!mergeFx) return undefined
        const timer = setTimeout(() => setMergeFx(null), 980)
        return () => clearTimeout(timer)
      }, [mergeFx])

      function positionOf(row) {
        return positionsRef.current[row.key] || seedPosition(row.task, row.kind, balls.findIndex((item) => item.key === row.key))
      }

      function startDrag(event, row) {
        if (event.button && event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        stopInertia()
        const position = positionOf(row)
        movedRef.current = false
        const now = performance.now()
        const next = {
          key: row.key,
          kind: row.kind,
          taskId: row.task.id,
          startX: event.clientX,
          startY: event.clientY,
          originX: position.x,
          originY: position.y,
          lastX: position.x,
          lastY: position.y,
          lastTime: now,
          vx: 0,
          vy: 0
        }
        commitPositions({
          ...positionsRef.current,
          [row.key]: { ...position, vx: 0, vy: 0, sx: 1, sy: 1 }
        })
        dragRef.current = next
        setDrag(next)
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* ignore */ }
      }

      function moveDrag(event) {
        const currentDrag = dragRef.current
        if (!currentDrag || !fieldRef.current) return
        const rect = fieldRef.current.getBoundingClientRect()
        const dx = ((event.clientX - currentDrag.startX) / Math.max(1, rect.width)) * 100
        const dy = ((event.clientY - currentDrag.startY) / Math.max(1, rect.height)) * 100
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) movedRef.current = true
        const x = Math.max(7, Math.min(93, currentDrag.originX + dx))
        const y = Math.max(11, Math.min(87, currentDrag.originY + dy))
        const now = performance.now()
        const elapsed = Math.max(8, now - currentDrag.lastTime)
        const vx = ((x - currentDrag.lastX) / elapsed) * 1000
        const vy = ((y - currentDrag.lastY) / elapsed) * 1000
        currentDrag.lastX = x
        currentDrag.lastY = y
        currentDrag.lastTime = now
        currentDrag.vx = vx
        currentDrag.vy = vy
        dragRef.current = currentDrag
        setBallPosition(currentDrag.key, {
          x, y, vx, vy,
          sx: 1 + Math.min(0.22, Math.abs(vx) / 180),
          sy: 1 - Math.min(0.16, Math.abs(vx) / 360)
        })
      }

      function endDrag(event) {
        const currentDrag = dragRef.current
        if (!currentDrag) return
        dragRef.current = null
        setDrag(null)
        if (currentDrag.kind === 'actual' && fieldRef.current) {
          const rect = fieldRef.current.getBoundingClientRect()
          const current = positionsRef.current[currentDrag.key] || currentDrag
          let best = null
          let bestDistance = 58
          for (const row of balls) {
            if (row.kind !== 'plan') continue
            if (!canMergeBalls(row.task, rows.find((task) => task.id === currentDrag.taskId) || {})) continue
            const planPosition = positionsRef.current[row.key]
              || seedPosition(row.task, 'plan', balls.findIndex((item) => item.key === row.key))
            const distance = Math.hypot(
              ((current.x - planPosition.x) / 100) * rect.width,
              ((current.y - planPosition.y) / 100) * rect.height
            )
            if (distance < bestDistance) {
              best = { row, position: planPosition }
              bestDistance = distance
            }
          }
          if (best) {
            const greenKey = `${best.row.task.id}:green`
            commitPositions({
              ...positionsRef.current,
              [greenKey]: { ...best.position, vx: 0, vy: 0, sx: 1, sy: 1 }
            })
            setMergeFx({ x: best.position.x, y: best.position.y, tone: ballTone(best.row.task) })
            onMerge(best.row.task.id, currentDrag.taskId)
            try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
            return
          }
        }
        startInertia(currentDrag.key)
        try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
      }

      const mergedCount = balls.filter((ball) => ball.kind === 'green').length
      return h('section', { className: 'dp-ball-section' },
        h('div', { className: 'dp-ball-head' },
          h('div', null,
            h('div', { className: 'dp-label' }, h(Icon, { name: 'spark', size: 12 }), '这一天的能量球'),
            h('div', { className: 'dp-ball-sub' }, balls.length
              ? '颜色代表类型；把实际球拖向能匹配的计划球，融合成绿色。'
              : '先选类型再加任务，计划球会按类型着色。')
          ),
          mergedCount ? h('span', { className: 'dp-ball-count' }, `${mergedCount} 合并`) : null
        ),
        balls.length ? h('div', { className: 'dp-ball-field', ref: fieldRef },
          balls.map((row) => {
            const position = positionOf(row)
            const merged = row.kind === 'green'
            const actual = row.kind === 'actual'
            const size = 52 + (4 - (Number(row.task.priority) || 2)) * 3
            const meta = actual || merged ? ballMeta(row.task) : ''
            const label = `${row.task.title}，${categoryOf(row.task).label}${merged ? '，已合并' : actual ? '，实际球' : '，计划球'}${meta ? `，${meta}` : ''}`
            return h('button', {
              type: 'button',
              key: row.key,
              className: `dp-ball dp-ball--${ballTone(row.task)}${merged ? ' is-green' : ''}${row.kind === 'plan' ? ' is-plan' : ''}${actual ? ' is-actual' : ''}${drag?.key === row.key ? ' is-dragging' : ''}`,
              style: {
                left: `${position.x}%`,
                top: `${position.y}%`,
                '--dp-ball-size': `${size}px`,
                '--dp-sx': String(position.sx || 1),
                '--dp-sy': String(position.sy || 1)
              },
              title: label,
              'aria-label': `${label}，可拖动`,
              onPointerDown: (event) => startDrag(event, row),
              onPointerMove: moveDrag,
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
              onClick: (event) => {
                event.stopPropagation()
                if (movedRef.current) { movedRef.current = false; return }
                onOpen(row.task.id)
              }
            })
          }),
          mergeFx ? h('span', {
            className: `dp-cell-merge is-${mergeFx.tone}`,
            style: { left: `${mergeFx.x}%`, top: `${mergeFx.y}%` },
            'aria-hidden': 'true'
          },
            h('span', { className: 'dp-cell-merge-plan' }),
            h('span', { className: 'dp-cell-merge-actual' }),
            h('span', { className: 'dp-cell-merge-green' }),
            Array.from({ length: 7 }, (_, index) => h('i', { key: index, style: { '--dp-particle-angle': `${index * 51}deg` } }))
          ) : null
        ) : h('div', { className: 'dp-ball-empty' },
          h(Icon, { name: 'target', size: 18 }),
          h('span', null, '还没有能量球，先添加一条带类型的任务。')
        )
      )
    }

    function DateTaskList({ date, tasks, index, onOpen, onToggle, onAddSubtask, onReorder, onGoReview }) {
      const [expandedId, setExpandedId] = useState(null)
      const [dragId, setDragId] = useState(null)
      const [dragOverId, setDragOverId] = useState(null)
      useEffect(() => { setExpandedId(null) }, [date])
      const rows = rootsOnDate(tasks, index, date)
      const active = rows.filter((task) => !index.isDone(task))
      const overdue = date === todayStr()
        ? active.filter((task) => {
          const bounds = index.dateBounds(task)
          return bounds.start && bounds.start < date
        })
        : []
      const overdueIds = new Set(overdue.map((task) => task.id))
      const current = active.filter((task) => !overdueIds.has(task.id))
      const groups = []
      if (overdue.length) groups.push({ id: 'overdue', title: '已逾期', rows: overdue })
      if (current.length) groups.push({
        id: 'current',
        title: date < todayStr() ? '未完成' : date > todayStr() ? '计划' : '这一天',
        rows: current
      })

      function dropOn(targetId) {
        if (dragId && dragId !== targetId) onReorder(dragId, targetId)
        setDragId(null)
        setDragOverId(null)
      }

      function rowProps(task, allowDrag) {
        return {
          key: task.id,
          task,
          index,
          onOpen,
          onToggle,
          onAddSubtask,
          expanded: expandedId === task.id,
          onExpand: (id) => setExpandedId((value) => value === id ? null : id),
          draggable: allowDrag,
          onDragStart: (event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', task.id)
            setDragId(task.id)
          },
          onDragOver: (event) => {
            if (!allowDrag) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            if (dragOverId !== task.id) setDragOverId(task.id)
          },
          onDrop: (event) => { event.preventDefault(); dropOn(task.id) },
          isDragOver: dragOverId === task.id && dragId !== task.id
        }
      }

      if (!rows.length) {
        return h(EmptyState, {
          icon: date < todayStr() ? 'note' : 'spark',
          title: date < todayStr() ? '这一天没有记录' : date > todayStr() ? '这一天还是空的' : '今天还没有安排',
          text: date < todayStr()
            ? '可以在复盘里补记训练和身体感受，也可以补一条已完成的任务。'
            : '从上方输入框加一个任务；它会生成一颗计划球。',
          action: date <= todayStr()
            ? h('button', { type: 'button', className: 'dp-btn dp-btn-small', onClick: onGoReview }, '写这一天的复盘')
            : null
        })
      }

      return h('div', { className: 'dp-groups' },
        groups.map((group) => h('section', { className: 'dp-group', key: group.id },
          h('div', { className: 'dp-group-title' },
            h('span', null, group.title),
            h('span', { className: 'dp-group-count' }, group.rows.length)
          ),
          group.rows.map((task) => h(TaskRow, rowProps(task, true)))
        ))
      )
    }

    function dayLoadSeries(coach, date, length = 7) {
      const days = (coach?.days || []).filter((day) => day.date <= date)
      return days.slice(-length)
    }

    function ScaleInput({ label, hint, value, onChange, low, high }) {
      return h('div', { className: 'dp-scale-row' },
        h('div', { className: 'dp-scale-label' },
          h('span', null, label),
          hint ? h('small', null, hint) : null
        ),
        h('div', { className: 'dp-scale-dots', role: 'group', 'aria-label': label },
          [1, 2, 3, 4, 5].map((number) => h('button', {
            type: 'button',
            key: number,
            className: number <= value ? 'is-on' : '',
            onClick: () => onChange(number === value ? 0 : number),
            'aria-label': `${label} ${number} 分`,
            title: `${number} 分`
          }, h('span', null, number))
        )),
        h('span', { className: 'dp-scale-ends' }, `${low} · ${high}`)
      )
    }

    function DayReview({ date, tasks, index, reviews, coach, onSaveReview, onDate, onOpenTask, onGoPlan }) {
      const existing = (reviews || []).find((review) => review.period === 'day' && review.date === date)
      const [subjectiveFatigue, setSubjectiveFatigue] = useState(0)
      const [sleepQuality, setSleepQuality] = useState(0)
      const [soreness, setSoreness] = useState(0)
      const [mood, setMood] = useState(0)
      const [trainingRating, setTrainingRating] = useState(0)
      const [diary, setDiary] = useState('')
      const [trainingNote, setTrainingNote] = useState('')
      const [savedAt, setSavedAt] = useState(0)
      const day = coachDayFor(coach, date)
      const stats = dayStats(tasks, index, date)
      const series = dayLoadSeries(coach, date, 7)
      const maxLoad = Math.max(1, ...series.map((row) => Number(row.load) || 0))
      const tasksOnDay = rootsOnDate(tasks, index, date)
      const completedRows = tasksOnDay.filter((task) => index.isDone(task))
      const evaluation = day?.evaluation || (stats.total ? null : { label: '休息日', text: '这一天没有训练记录。恢复也是训练的一部分。', tone: 'idle' })
      const advice = coach?.advice || []
      const snapshot = existing?.loadSnapshot || null

      useEffect(() => {
        setSubjectiveFatigue(existing?.subjectiveFatigue || 0)
        setSleepQuality(existing?.sleepQuality || 0)
        setSoreness(existing?.soreness || 0)
        setMood(existing?.mood || 0)
        setTrainingRating(existing?.trainingRating || existing?.rating || 0)
        setDiary(existing?.diary || existing?.note || '')
        setTrainingNote(existing?.trainingNote || '')
        setSavedAt(0)
      }, [date, existing?.id])

      function save() {
        const load = Number(day?.load) || 0
        const snapshot = {
          dataFatigue: Number(day?.dataFatigue) || 0,
          load,
          ctl: Number(day?.ctl) || 0,
          atl: Number(day?.atl) || 0,
          tsb: Number(day?.tsb) || 0,
          acwr: Number(day?.acwr) || 0,
          monotony: Number(day?.monotony) || 0,
          readiness: Number(day?.readiness) || 0,
          evaluation: evaluation?.label || '休息日'
        }
        onSaveReview({
          period: 'day',
          date,
          rating: trainingRating,
          note: diary.trim(),
          subjectiveFatigue,
          sleepQuality,
          soreness,
          mood,
          trainingRating,
          trainingNote: trainingNote.trim(),
          diary: diary.trim(),
          advice: advice.map((item) => item.text).join(' '),
          dataFatigue: snapshot.dataFatigue,
          loadSnapshot: snapshot,
          ctl: snapshot.ctl,
          atl: snapshot.atl,
          tsb: snapshot.tsb,
          acwr: snapshot.acwr,
          completedCount: completedRows.length,
          totalCount: stats.total
        })
        setSavedAt(Date.now())
      }

      const recent = [...(reviews || [])]
        .filter((review) => review.period === 'day' && (review.diary || review.note || review.subjectiveFatigue))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 5)

      return h('div', { className: 'dp-review dp-dayreview' },
        h('div', { className: 'dp-day-head' },
          h('div', null,
            h('div', { className: 'dp-eyebrow' }, date === todayStr() ? '今天' : date < todayStr() ? '过去' : '未来'),
            h('h2', { className: 'dp-day-title' }, shortDate(date))
          ),
          h('div', { className: 'dp-day-nav' },
            h('button', { type: 'button', className: 'dp-icon-btn', onClick: () => onDate(addDays(date, -1)), 'aria-label': '前一天' }, h(Icon, { name: 'chevronLeft', size: 14 })),
            h('button', { type: 'button', className: 'dp-icon-btn', onClick: () => onDate(todayStr()), 'aria-label': '回到今天' }, h(Icon, { name: 'calendar', size: 14 })),
            h('button', { type: 'button', className: 'dp-icon-btn', onClick: () => onDate(addDays(date, 1)), 'aria-label': '后一天' }, h(Icon, { name: 'chevronRight', size: 14 }))
          )
        ),

        h('div', { className: 'dp-review-hero' },
          h(Ring, {
            percent: stats.percent,
            size: 88,
            stroke: 7
          }, `${Math.round(stats.percent)}%`),
          h('div', { className: 'dp-review-hero-copy' },
            h('div', { className: 'dp-review-big' }, `${stats.done} / ${stats.total}`),
            h('div', { className: 'dp-muted' }, '当天任务完成度'),
            h('div', { className: 'dp-review-sub' },
              stats.total
                ? stats.done === stats.total ? '全部完成。把感受写下来，明天会更清楚。' : `${stats.total - stats.done} 个任务还开着。`
                : '这一天还没有计划任务，也可以补记训练。'
            ),
            h('button', { type: 'button', className: 'dp-btn dp-btn-small dp-review-plan-btn', onClick: onGoPlan },
              h(Icon, { name: 'calendar', size: 12 }), '回到这一天'
            )
          )
        ),

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-section-head' },
            h('div', { className: 'dp-label' }, h(Icon, { name: 'heart', size: 13 }), '身体感受'),
            h('span', { className: 'dp-muted' }, '主观记录')
          ),
          h('div', { className: 'dp-scale-grid' },
            h(ScaleInput, { label: '主观疲劳', hint: '练完有多累', value: subjectiveFatigue, onChange: setSubjectiveFatigue, low: '很低', high: '很高' }),
            h(ScaleInput, { label: '睡眠质量', hint: '昨晚睡得如何', value: sleepQuality, onChange: setSleepQuality, low: '很差', high: '很好' }),
            h(ScaleInput, { label: '肌肉酸痛', hint: '按压/上下楼', value: soreness, onChange: setSoreness, low: '没有', high: '严重' }),
            h(ScaleInput, { label: '心情', hint: '训练前后整体', value: mood, onChange: setMood, low: '低落', high: '很好' })
          )
        ),

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-section-head' },
            h('div', { className: 'dp-label' }, h(Icon, { name: 'activity', size: 13 }), '数据负荷'),
            h('span', { className: `dp-coach-chip is-${evaluation?.tone || 'idle'}` }, evaluation?.label || '无数据')
          ),
          h('div', { className: 'dp-metric-grid' },
            h('div', { className: 'dp-metric' },
              h('span', null, '数据疲劳'),
              h('b', null, day ? `${Math.round(day.dataFatigue || 0)}%` : (snapshot ? `${snapshot.dataFatigue}%` : '—')),
              h('small', null, '由 HRV / RHR / 负荷推算')
            ),
            h('div', { className: 'dp-metric' },
              h('span', null, '长期负荷 CTL'),
              h('b', null, day ? Math.round(day.ctl || 0) : (snapshot?.ctl ?? '—')),
              h('small', null, '42 天体能基线')
            ),
            h('div', { className: 'dp-metric' },
              h('span', null, '短期负荷 ATL'),
              h('b', null, day ? Math.round(day.atl || 0) : (snapshot?.atl ?? '—')),
              h('small', null, '7 天疲劳')
            ),
            h('div', { className: 'dp-metric' },
              h('span', null, '状态 TSB'),
              h('b', { className: (day?.tsb || 0) < -20 ? 'is-warn' : '' }, day ? Math.round(day.tsb || 0) : (snapshot?.tsb ?? '—')),
              h('small', null, '体能减疲劳')
            ),
            h('div', { className: 'dp-metric' },
              h('span', null, 'ACWR'),
              h('b', { className: (day?.acwr || 0) > 1.35 ? 'is-warn' : '' }, day ? (day.acwr || 0).toFixed(2) : (snapshot?.acwr ?? '—')),
              h('small', null, '7 天 / 28 天负荷比')
            ),
            h('div', { className: 'dp-metric' },
              h('span', null, '这一天的负荷'),
              h('b', null, day ? Math.round(day.load || 0) : (snapshot?.load ?? '—')),
              h('small', null, day?.sessions ? `${day.sessions} 次训练` : '训练负荷')
            )
          ),
          h('div', { className: 'dp-mini-chart-head' },
            h('span', null, '近 7 天负荷'),
            h('span', { className: 'dp-muted' }, `${Math.round(series.reduce((sum, row) => sum + Number(row.load || 0), 0))} 总负荷`)
          ),
          h('div', { className: 'dp-load-chart', role: 'img', 'aria-label': '近 7 天训练负荷' },
            series.length ? series.map((row) => h('div', { className: 'dp-load-col', key: row.date, title: `${shortDate(row.date)}：负荷 ${Math.round(row.load || 0)}` },
              h('div', { className: 'dp-load-track' },
                h('span', {
                  className: `dp-load-bar${row.date === date ? ' is-active' : ''}${row.load > 120 ? ' is-high' : ''}`,
                  style: { height: `${Math.max(4, (Number(row.load) / maxLoad) * 100)}%` }
                })
              ),
              h('span', { className: `dp-load-label${row.date === date ? ' is-active' : ''}` }, weekday(row.date).slice(1))
            )) : h('span', { className: 'dp-muted' }, '暂无负荷数据')
          ),
          evaluation?.text ? h('p', { className: 'dp-coach-note' }, evaluation.text) : null
        ),

        advice.length ? h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'spark', size: 13 }), '训练建议'),
          h('div', { className: 'dp-advice-list' },
            advice.slice(0, 3).map((item, i) => h('div', { className: 'dp-advice', key: `${item.title}-${i}` },
              h('div', { className: 'dp-advice-title' }, item.title),
              h('p', null, item.text)
            ))
          )
        ) : null,

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-section-head' },
            h('div', { className: 'dp-label' }, h(Icon, { name: 'note', size: 13 }), '训练日记'),
            h('span', { className: 'dp-muted' }, '只保存在本机')
          ),
          h('textarea', {
            className: 'dp-textarea',
            rows: 4,
            placeholder: '今天训练感受如何？哪一段最顺、哪一段最难？明天想守住什么？',
            value: diary,
            onChange: (event) => setDiary(event.target.value)
          }),
          h('div', { className: 'dp-field-row dp-training-note' },
            h('label', { className: 'dp-field' },
              h('span', null, '训练备注'),
              h('input', {
                value: trainingNote,
                onChange: (event) => setTrainingNote(event.target.value),
                placeholder: '配速、路线、动作、装备…'
              })
            ),
            h('label', { className: 'dp-field dp-field-narrow' },
              h('span', null, '训练评分'),
              h('select', { value: trainingRating, onChange: (event) => setTrainingRating(Number(event.target.value)) },
                h('option', { value: 0 }, '未评分'),
                [1, 2, 3, 4, 5].map((value) => h('option', { value, key: value }, `${value} 分`))
              )
            )
          )
        ),

        h('div', { className: 'dp-save-row' },
          h('button', { type: 'button', className: 'dp-btn dp-btn-primary', onClick: save }, existing ? '更新这一天' : '保存这一天'),
          savedAt ? h('span', { className: 'dp-saved-note' }, '已保存') : existing ? h('span', { className: 'dp-muted' }, '已有一份记录') : null
        ),

        completedRows.length ? h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'check', size: 13 }), '完成的训练'),
          h('div', { className: 'dp-review-list' },
            completedRows.slice(0, 12).map((task) => h('button', {
              type: 'button', key: task.id, className: 'dp-review-task', onClick: () => onOpenTask(task.id)
            },
              h('span', { className: 'dp-review-check' }, h(Icon, { name: 'check', size: 11 })),
              h('span', { className: 'dp-review-task-title' }, task.title),
              task.completedAt ? h('span', { className: 'dp-muted' }, formatClock(task.completedAt)) : null
            ))
          )
        ) : null,

        recent.length ? h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'note', size: 13 }), '最近复盘'),
          h('div', { className: 'dp-review-history' },
            recent.map((review) => h('div', { className: 'dp-history-item', key: review.id },
              h('div', { className: 'dp-history-top' },
                h('span', null, shortDate(review.date)),
                review.subjectiveFatigue ? h('span', { className: 'dp-muted' }, `疲劳 ${review.subjectiveFatigue}/5`) : null,
                review.trainingRating ? h('span', { className: 'dp-history-rating' }, '★'.repeat(review.trainingRating)) : null
              ),
              review.diary || review.note ? h('p', null, review.diary || review.note) : null
            ))
          )
        ) : null
      )
    }

    function CoachView({ coach, data, onGoSync, onOpen }) {
      if (!coach?.today) {
        return h(EmptyState, {
          icon: 'activity',
          title: '教练还没有数据',
          text: '先连接 COROS 并同步一次，这里会显示准备度、负荷、恢复和成绩预测。',
          action: h('button', { type: 'button', className: 'dp-btn dp-btn-primary', onClick: onGoSync }, '去同步')
        })
      }
      const today = coach.today
      const week = coach.week || {}
      const series = (coach.days || []).slice(-14)
      const maxLoad = Math.max(1, ...series.map((day) => Number(day.load) || 0))
      const readinessLabel = today.readiness >= 80 ? '准备充分' : today.readiness >= 65 ? '状态良好' : today.readiness >= 50 ? '状态一般' : today.readiness >= 35 ? '疲劳偏高' : '优先恢复'
      const advice = coach.advice || []
      const metrics = [
        ['长期负荷', Math.round(today.ctl || 0), 'CTL · 42 天'],
        ['短期负荷', Math.round(today.atl || 0), 'ATL · 7 天'],
        ['状态', Math.round(today.tsb || 0), 'TSB · 体能减疲劳'],
        ['负荷比', (today.acwr || 0).toFixed(2), 'ACWR · 7/28 天'],
        ['单调性', (today.monotony || 0).toFixed(1), 'Monotony'],
        ['周负荷', Math.round(today.weekLoad || 0), '最近 7 天']
      ]
      const recovery = [
        ['HRV', today.hrv ? Math.round(today.hrv) : '—', today.hrvBase ? `基线 ${Math.round(today.hrvBase)}` : '无基线'],
        ['静息心率', today.rhr ? Math.round(today.rhr) : '—', today.rhrBase ? `基线 ${Math.round(today.rhrBase)}` : '无基线'],
        ['VO₂max', today.vo2max ? Math.round(today.vo2max) : '—', '最大摄氧量'],
        ['阈值心率', today.lthr ? Math.round(today.lthr) : '—', 'LTHR'],
        ['阈值配速', today.ltsp ? `${Math.floor(today.ltsp / 60)}:${String(Math.round(today.ltsp % 60)).padStart(2, '0')}` : '—', 'LTSP /km'],
        ['耐力', today.stamina ? Math.round(today.stamina) : '—', 'Stamina']
      ]
      if (today.sleepScore > 0) {
        recovery.splice(2, 0, [
          '睡眠评分',
          Math.round(today.sleepScore),
          today.sleepMin ? `${(today.sleepMin / 60).toFixed(1)} 小时` : 'COROS 每日指标'
        ])
      }

      return h('div', { className: 'dp-coach' },
        h('div', { className: 'dp-coach-hero' },
          h(Ring, { percent: today.readiness, size: 104, stroke: 8 }, `${Math.round(today.readiness)}`),
          h('div', { className: 'dp-coach-hero-copy' },
            h('div', { className: 'dp-eyebrow' }, '训练准备度'),
            h('h2', null, readinessLabel),
            h('p', { className: 'dp-muted' }, today.evaluation?.text || '用恢复数据和负荷决定今天怎么练。'),
            h('div', { className: 'dp-coach-pills' },
              h('span', { className: 'dp-pill' }, `数据疲劳 ${Math.round(today.dataFatigue)}%`),
              h('span', { className: 'dp-pill' }, `准备度 ${Math.round(today.readiness)}`)
            )
          )
        ),

        h('div', { className: 'dp-coach-actions' },
          h('button', { type: 'button', className: 'dp-btn dp-btn-small', onClick: onGoSync },
            h(Icon, { name: 'refresh', size: 12 }), '刷新同步'
          ),
          h('span', { className: 'dp-muted' }, `最近 7 天 ${week.sessions || 0} 次 · ${week.distanceKm || 0} km · ${week.durationMin || 0} 分钟`)
        ),

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'chart', size: 13 }), '负荷与状态'),
          h('div', { className: 'dp-metric-grid is-wide' },
            metrics.map(([label, value, hint]) => h('div', { className: 'dp-metric', key: label },
              h('span', null, label),
              h('b', null, value),
              h('small', null, hint)
            ))
          ),
          h('div', { className: 'dp-mini-chart-head' },
            h('span', null, '近 14 天负荷'),
            h('span', { className: 'dp-muted' }, `本周 ${week.load || 0}`)
          ),
          h('div', { className: 'dp-load-chart is-coach', role: 'img', 'aria-label': '近 14 天训练负荷' },
            series.map((day) => h('div', { className: 'dp-load-col', key: day.date, title: `${shortDate(day.date)}：负荷 ${Math.round(day.load || 0)}，准备度 ${Math.round(day.readiness || 0)}` },
              h('div', { className: 'dp-load-track' },
                h('span', {
                  className: `dp-load-bar${day.date === todayStr() ? ' is-active' : ''}${day.load > 120 ? ' is-high' : ''}`,
                  style: { height: `${Math.max(3, (Number(day.load) / maxLoad) * 100)}%` }
                })
              ),
              h('span', { className: `dp-load-label${day.date === todayStr() ? ' is-active' : ''}` }, Number(day.date.slice(8, 10)))
            ))
          )
        ),

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'spark', size: 13 }), '训练建议'),
          advice.length ? h('div', { className: 'dp-advice-list' },
            advice.map((item, index) => h('div', { className: `dp-advice is-${item.level}`, key: `${item.title}-${index}` },
              h('div', { className: 'dp-advice-title' }, item.title),
              h('p', null, item.text)
            ))
          ) : h('p', { className: 'dp-muted' }, '数据还不够，先积累几天训练记录。')
        ),

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'heart', size: 13 }), '恢复指标'),
          h('div', { className: 'dp-metric-grid' },
            recovery.map(([label, value, hint]) => h('div', { className: 'dp-metric', key: label },
              h('span', null, label),
              h('b', null, value),
              h('small', null, hint)
            ))
          )
        ),

        coach.predictions?.length ? h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'flag', size: 13 }), '成绩预测'),
          h('div', { className: 'dp-prediction-grid' },
            coach.predictions.map((row) => h('div', { className: 'dp-prediction', key: row.key },
              h('span', null, row.label),
              h('b', null, row.time),
              h('small', null, `${row.pace} /km`)
            ))
          ),
          h('p', { className: 'dp-muted dp-prediction-note' }, '按最近最佳跑步用 Riegel 指数外推，只作趋势参考。')
        ) : null,

        coach.recent?.length ? h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'activity', size: 13 }), '近期训练'),
          h('div', { className: 'dp-activity-list' },
            coach.recent.slice(0, 6).map((activity) => h('div', { className: 'dp-activity-row', key: activity.id },
              h('span', { className: 'dp-activity-dot' }),
              h('div', { className: 'dp-activity-main' },
                h('span', null, activity.name || SPORT_LABELS[activity.sport] || '训练'),
                h('small', null, `${shortDate(activity.date)} · ${activity.distanceKm ? `${activity.distanceKm} km · ` : ''}${activity.durationMin || 0} 分钟${activity.avgHr ? ` · ${activity.avgHr} bpm` : ''}${activity.calories ? ` · ${Math.round(activity.calories)} kcal` : ''}`)
              ),
              h('span', { className: 'dp-activity-load' }, `${Math.round(activityLoadForClient(activity, today.lthr))}`)
            ))
          )
        ) : null
      )
    }

    function activityLoadForClient(activity, lthr) {
      const given = Number(activity?.trainingLoad)
      if (given > 0) return given
      const minutes = Number(activity?.durationMin) || 0
      const hr = Number(activity?.avgHr) || 0
      const threshold = Number(lthr) || 165
      return Math.round(minutes * Math.max(0.45, Math.min(1.75, hr > 0 ? (hr - 45) / Math.max(40, threshold - 45) : 0.9)))
    }

    const PLANNER_MODES = [
      ['plan', '计划'],
      ['review', '复盘'],
      ['coach', '教练'],
      ['sync', '同步']
    ]

    function PlannerBody() {
      const planner = usePlanner()
      const [view, setView] = useState('plan')
      const [selectedDate, setSelectedDate] = useState(todayStr())
      const [selectedId, setSelectedId] = useState(null)
      const [notice, setNotice] = useState('')
      const data = planner.data
      const tasks = data?.tasks || []
      const index = useMemo(() => buildIndex(tasks), [tasks])
      const coach = data?.coach || null
      const stats = useMemo(() => dayStats(tasks, index, selectedDate), [tasks, index, selectedDate])
      const day = coachDayFor(coach, selectedDate)

      useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(''), 3500)
        return () => clearTimeout(timer)
      }, [notice])

      const selected = selectedId ? tasks.find((task) => task.id === selectedId) : null
      useEffect(() => {
        if (selectedId && !selected) setSelectedId(null)
      }, [selectedId, selected])

      useEffect(() => {
        if (!['plan', 'review'].includes(view)) return
        if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) setSelectedDate(todayStr())
      }, [view, selectedDate])

      useEffect(() => {
        function onKeyDown(event) {
          const target = event.target
          const typing = target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
          if (event.key === 'Escape') {
            if (selectedId) setSelectedId(null)
            else if (typing) target.blur()
            return
          }
          if (typing || event.metaKey || event.ctrlKey || event.altKey) return
          if (view === 'plan' && event.key.toLowerCase() === 'n') {
            event.preventDefault()
            document.querySelector('.dp-composer-wrap input')?.focus()
            return
          }
          if (event.key.toLowerCase() === 'r') planner.refresh(false)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [selectedId, view, planner.refresh])

      if (planner.loading && !data) {
        return h('div', { className: 'dsh-planner dp-centered' },
          h('span', { className: 'dp-spinner' }),
          h('p', { className: 'dp-muted' }, '正在读取 rundiag…')
        )
      }

      if (!data) {
        return h('div', { className: 'dsh-planner dp-centered' },
          h('span', { className: 'dp-empty-icon' }, h(Icon, { name: 'plug', size: 22 })),
          h('h2', { className: 'dp-centered-title' }, '无法读取 rundiag 数据'),
          h('p', { className: 'dp-muted' }, planner.error || '请确认 DSH 服务正在运行。'),
          h('button', { type: 'button', className: 'dp-btn dp-btn-primary', onClick: () => planner.refresh(false) }, '重试')
        )
      }

      const saveText = planner.saving === 'saving'
        ? '保存中…'
        : planner.saving === 'pending'
          ? '待保存'
          : planner.saving === 'error'
            ? '保存失败'
            : planner.lastSaved
              ? `已保存 ${formatClock(new Date(planner.lastSaved).toISOString())}`
              : ''
      const isToday = selectedDate === todayStr()
      const dayTitle = isToday ? '今天' : selectedDate < todayStr() ? '过去' : '未来'

      function addRoot(input) {
        const parsed = typeof input === 'string' ? { title: input } : input
        if (!parsed?.title) return
        planner.addTask({
          title: parsed.title,
          tags: parsed.tags || [],
          priority: parsed.priority || 2,
          category: parsed.category || 'other',
          dueDate: parsed.dueDate || selectedDate
        })
      }

      async function exportBackup() {
        try {
          await planner.exportData()
          setNotice('JSON 备份已导出')
        } catch (error) {
          setNotice(error?.message || '导出失败')
        }
      }

      function addSubtask(parentId, title) {
        const id = planner.addTask({ title, parentId })
        if (id) setNotice('子任务已创建')
      }

      function saveReview(review) {
        planner.saveReview(review)
        setNotice('复盘已保存')
      }

      function mergeBalls(id, sourceId = '') {
        planner.mergeBall(id, sourceId)
        setNotice(sourceId && sourceId !== id ? '两颗球融合成一枚绿色能量球。' : '计划与实际合体，变成绿色能量球。')
      }

      const header = h('div', { className: 'dp-head' },
        h('div', { className: 'dp-brand' },
          h('span', { className: 'dp-logo' }, h(Icon, { name: 'check', size: 16 })),
          h('div', null,
            h('h1', null, 'rundiag'),
            h('p', null, weekday(selectedDate))
          )
        ),
        h('div', { className: 'dp-head-actions' },
          saveText ? h('span', { className: `dp-save${planner.saving === 'error' ? ' is-error' : ''}`, title: '数据保存在本机' }, saveText) : null,
          h('button', {
            type: 'button',
            className: 'dp-icon-btn',
            title: '导出 JSON 备份',
            onClick: exportBackup
          }, h(Icon, { name: 'download', size: 15 })),
          h('button', {
            type: 'button',
            className: 'dp-icon-btn',
            title: '刷新',
            onClick: () => planner.refresh(false)
          }, h(Icon, { name: 'refresh', size: 15 }))
        )
      )

      const modes = h('div', { className: 'dp-tabs dp-mode-tabs' },
        PLANNER_MODES.map(([id, label]) => h('button', {
          type: 'button',
          key: id,
          className: `dp-tab${view === id ? ' is-active' : ''}`,
          onClick: () => setView(id)
        }, label,
          id === 'review' && data.reviews?.some((review) => review.date === selectedDate)
            ? h('span', { className: 'dp-tab-dot' })
            : null
        ))
      )

      const dateRail = ['plan', 'review'].includes(view)
        ? h(DateRail, {
          date: selectedDate,
          onSelect: setSelectedDate,
          tasks,
          index,
          reviews: data.reviews || []
        })
        : null

      const dayCard = h('div', { className: 'dp-day-summary' },
        h('div', { className: 'dp-day-summary-main' },
          h('div', { className: 'dp-day-summary-top' },
            h('span', { className: 'dp-eyebrow' }, dayTitle),
            h('span', { className: 'dp-day-summary-count' }, `${stats.done}/${stats.total}`)
          ),
          h('div', { className: 'dp-day-summary-bar' }, h(Bar, { percent: stats.percent })),
          h('div', { className: 'dp-day-summary-caption' },
            stats.total
              ? stats.done === stats.total ? '全部完成，收个尾。' : `${stats.total - stats.done} 个任务还开着。`
              : '没有任务的日子，也可以只是一次轻松恢复。'
          )
        ),
        h('div', { className: 'dp-day-summary-side' },
          day ? h('span', { className: `dp-coach-chip is-${day.evaluation?.tone || 'idle'}` }, `准备度 ${Math.round(day.readiness)}`) : null,
          selectedDate <= todayStr()
            ? h('button', { type: 'button', className: 'dp-btn dp-btn-small', onClick: () => setView('review') }, '写复盘')
            : null
        )
      )

      if (selected) {
        return h('div', { className: 'dsh-planner' },
          h(TaskDetail, {
            task: selected,
            tasks,
            index,
            onBack: () => setSelectedId(null),
            onOpen: (id) => setSelectedId(id),
            onUpdate: planner.updateTask,
            onToggle: planner.toggleTask,
            onDelete: (id) => { planner.deleteTask(id); setSelectedId(null) },
            onAddSubtask: addSubtask
          }),
          notice ? h('div', { className: 'dp-toast' }, notice) : null
        )
      }

      let content = null
      if (view === 'plan') {
        content = h('div', { className: 'dp-body' },
          h('div', { className: 'dp-list-view' },
            dayCard,
            h(BallField, {
              date: selectedDate,
              tasks,
              index,
              onMerge: mergeBalls,
              onOpen: (id) => setSelectedId(id)
            }),
            h(AddComposer, {
              onAdd: addRoot,
              placeholder: `添加 ${isToday ? '今天' : dateLabel(selectedDate)} 的任务，支持 #标签、明天、!高…`
            }),
            planner.error ? h('div', { className: 'dp-alert is-error' },
              h(Icon, { name: 'x', size: 13 }),
              h('span', null, planner.error),
              h('button', { type: 'button', className: 'dp-alert-close', onClick: () => planner.setError('') }, h(Icon, { name: 'x', size: 12 }))
            ) : null,
            h(DateTaskList, {
              date: selectedDate,
              tasks,
              index,
              onOpen: (id) => setSelectedId(id),
              onToggle: planner.toggleTask,
              onAddSubtask: addSubtask,
              onReorder: planner.reorderTasks,
              onGoReview: () => setView('review')
            }),
            h('div', { className: 'dp-foot' },
              h('span', null, 'N 新建'),
              h('span', null, '·'),
              h('span', null, '拖动排序'),
              h('span', null, '·'),
              h('span', null, '本机保存')
            )
          )
        )
      } else if (view === 'review') {
        content = h('div', { className: 'dp-body' },
          h(DayReview, {
            date: selectedDate,
            tasks,
            index,
            reviews: data.reviews || [],
            coach,
            onSaveReview: saveReview,
            onDate: setSelectedDate,
            onOpenTask: (id) => setSelectedId(id),
            onGoPlan: () => setView('plan')
          })
        )
      } else if (view === 'coach') {
        content = h('div', { className: 'dp-body' },
          h(CoachView, {
            coach,
            data,
            onGoSync: () => setView('sync')
          })
        )
      } else {
        content = h('div', { className: 'dp-body' },
          h(SyncView, {
            data,
            onConnect: planner.connectCoros,
            onDisconnect: planner.disconnectCoros,
            onSync: planner.syncNow,
            onToggleAuto: planner.setAutoSync,
            onToggleAutoCreate: planner.setAutoCreate,
            onImport: planner.importActivities
          })
        )
      }

      return h('div', { className: 'dsh-planner' },
        header,
        modes,
        dateRail,
        content,
        notice ? h('div', { className: 'dp-toast' }, notice) : null
      )
    }

    function PlannerTitle() {
      return h('span', { className: 'dp-title-slot' },
        h(Icon, { name: 'check', size: 13 }),
        h('span', null, 'rundiag')
      )
    }

    // -------------------------------------------------------------------- styles

    const STYLE_ID = 'dsh-rundiag-style'

    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        .dsh-planner { position: relative; height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 13px; line-height: 1.45; overflow: hidden; }
        .dsh-planner * { box-sizing: border-box; }
        .dsh-planner button, .dsh-planner input, .dsh-planner textarea, .dsh-planner select { font: inherit; color: inherit; }
        .dsh-planner button { cursor: pointer; }
        .dsh-planner button:disabled { cursor: default; opacity: .5; }
        .dsh-planner input, .dsh-planner textarea, .dsh-planner select { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; padding: 7px 9px; outline: none; min-width: 0; }
        .dsh-planner input:focus, .dsh-planner textarea:focus, .dsh-planner select:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
        .dsh-planner textarea { resize: vertical; line-height: 1.55; }
        .dsh-planner select { cursor: pointer; }
        .dsh-planner h1, .dsh-planner h2, .dsh-planner p { margin: 0; }
        .dp-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 13px 14px 9px; flex: none; }
        .dp-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
        .dp-logo { width: 29px; height: 29px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; flex: none; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color: var(--dsw-alias-brand-primary); }
        .dp-brand h1 { font-size: 15px; font-weight: 650; letter-spacing: .01em; }
        .dp-brand p { color: var(--dsw-alias-label-secondary); font-size: 11px; margin-top: 1px; }
        .dp-head-actions { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .dp-save { color: var(--dsw-alias-label-secondary); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 88px; }
        .dp-save.is-error { color: var(--dsw-alias-state-error-primary); }
        .dp-icon-btn { width: 27px; height: 27px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); display: inline-flex; align-items: center; justify-content: center; flex: none; padding: 0; }
        .dp-icon-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
        .dp-icon-btn.is-success { color: var(--dsw-alias-state-success-primary); }
        .dp-overview { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; padding: 0 14px 9px; flex: none; }
        .dp-overview-item { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; padding: 7px 9px 8px; min-width: 0; }
        .dp-overview-head { display: flex; align-items: baseline; justify-content: space-between; gap: 4px; color: var(--dsw-alias-label-secondary); font-size: 10px; margin-bottom: 5px; }
        .dp-overview-head b { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; }
        .dp-bar { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
        .dp-bar span { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary); transition: width .25s ease; }
        .dp-bar-task { margin-top: 5px; height: 3px; max-width: 170px; }
        .dp-tabs { display: flex; align-items: center; gap: 1px; padding: 0 10px 7px; flex: none; border-bottom: 1px solid var(--dsw-alias-border-l1); overflow-x: auto; scrollbar-width: none; }
        .dp-tabs::-webkit-scrollbar { display: none; }
        .dp-tab { appearance: none; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); padding: 6px 9px; border-radius: 6px; white-space: nowrap; font-size: 12px; }
        .dp-tab:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
        .dp-tab.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); font-weight: 600; }
        .dp-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px 0; flex: none; }
        .dp-search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; padding: 3px 6px 3px 8px; }
        .dp-search:focus-within { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); }
        .dp-search input { flex: 1; min-width: 0; border: 0; background: transparent; box-shadow: none; padding: 3px 0; font-size: 11px; }
        .dp-search input:focus { box-shadow: none; }
        .dp-search-clear { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); padding: 1px; display: inline-flex; border-radius: 3px; }
        .dp-search-clear:hover { color: var(--dsw-alias-label-primary); }
        .dp-toolbar-count { flex: none; color: var(--dsw-alias-label-secondary); font-size: 9px; white-space: nowrap; }
        .dp-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2) transparent; }
        .dp-list-view { padding: 10px 12px 18px; }
        .dp-composer-wrap { margin-bottom: 10px; }
        .dp-composer-wrap .dp-composer { margin-bottom: 0; }
        .dp-composer { display: flex; align-items: center; gap: 7px; padding: 5px 7px 5px 9px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 9px; }
        .dp-composer:focus-within { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
        .dp-composer-icon { color: var(--dsw-alias-label-secondary); flex: none; }
        .dp-composer input { flex: 1; background: transparent; border: 0; box-shadow: none; padding: 5px 0; font-size: 13px; }
        .dp-composer input:focus { box-shadow: none; }
        .dp-composer-hint { color: var(--dsw-alias-label-secondary); opacity: .7; font-size: 9px; margin: 4px 3px 0; }
        .dp-category-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding: 3px 1px 7px; }
        .dp-category { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 3px 7px 3px 3px; font-size: 9px; line-height: 1; }
        .dp-category:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
        .dp-category.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 38%, transparent); color: var(--dsw-alias-label-primary); font-weight: 650; }
        .dp-category-glyph { width: 16px; height: 16px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; flex: none; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
        .dp-category-glyph.is-training { color: var(--dsw-alias-state-idle-primary); background: color-mix(in srgb, var(--dsw-alias-state-idle-primary) 14%, transparent); }
        .dp-category-glyph.is-study { color: var(--dsw-alias-state-idle-primary); background: color-mix(in srgb, var(--dsw-alias-state-idle-primary) 16%, transparent); }
        .dp-category-glyph.is-work { color: var(--dsw-alias-state-warn-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent); }
        .dp-category-glyph.is-life { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); }
        .dp-category-glyph.is-create { color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); }
        .dp-category-glyph.is-other { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
        .dp-quick-preview { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 5px 2px 0; }
        .dp-quick-chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); color: var(--dsw-alias-brand-primary); border: 1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent); font-size: 9px; }
        .dp-groups { display: flex; flex-direction: column; gap: 12px; }
        .dp-group { display: flex; flex-direction: column; gap: 1px; }
        .dp-group-title { display: flex; align-items: center; gap: 6px; padding: 2px 3px 5px; color: var(--dsw-alias-label-secondary); font-size: 10px; font-weight: 600; letter-spacing: .04em; }
        .dp-group-count { margin-left: auto; font-weight: 500; opacity: .75; }
        .dp-task-wrap { position: relative; border-radius: 9px; }
        .dp-task-wrap.is-expanded { background: var(--dsw-alias-bg-layer-1); }
        .dp-task-wrap.is-drag-over { box-shadow: inset 0 2px 0 var(--dsw-alias-brand-primary); }
        .dp-task-wrap[draggable="true"] .dp-task { cursor: grab; }
        .dp-task-wrap[draggable="true"] .dp-task:active { cursor: grabbing; }
        .dp-task { display: flex; align-items: flex-start; gap: 8px; padding: 8px 7px; border-radius: 8px; cursor: pointer; position: relative; border: 1px solid transparent; }
        .dp-task:hover { background: var(--dsw-alias-bg-layer-1); border-color: var(--dsw-alias-border-l1); }
        .dp-task:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
        .dp-task.is-done .dp-task-title { color: var(--dsw-alias-label-secondary); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--dsw-alias-label-secondary) 65%, transparent); }
        .dp-expand { width: 20px; height: 22px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); display: inline-flex; align-items: center; justify-content: center; flex: none; padding: 0; border-radius: 4px; margin-top: 1px; }
        .dp-expand:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
        .dp-inline-panel { margin: 0 7px 5px 33px; padding: 2px 7px 6px 9px; border-left: 1px solid var(--dsw-alias-border-l1); }
        .dp-inline-subrows { display: flex; flex-direction: column; gap: 1px; }
        .dp-inline-sub { display: flex; align-items: center; gap: 7px; padding: 3px 0; min-height: 24px; }
        .dp-inline-sub-title { flex: 1; min-width: 0; border: 0; background: transparent; text-align: left; padding: 1px 0; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-inline-sub-title:hover { color: var(--dsw-alias-brand-primary); }
        .dp-inline-sub-title.is-done { color: var(--dsw-alias-label-secondary); text-decoration: line-through; }
        .dp-inline-sub-date { flex: none; color: var(--dsw-alias-label-secondary); font-size: 9px; }
        .dp-inline-add { display: flex; align-items: center; gap: 4px; margin-top: 3px; padding: 2px 0 1px; color: var(--dsw-alias-label-secondary); }
        .dp-inline-add input { flex: 1; min-width: 0; border: 0; background: transparent; box-shadow: none; padding: 2px 0; font-size: 10px; }
        .dp-inline-add input:focus { box-shadow: none; }
        .dp-check { flex: none; border: 1.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-bg-base)); display: inline-flex; align-items: center; justify-content: center; padding: 0; transition: background .15s ease, border-color .15s ease; margin-top: 1px; }
        .dp-check:hover { border-color: var(--dsw-alias-brand-primary); }
        .dsh-planner .dp-check.is-done { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-bg-base)); }
        .dp-task-mid { flex: 1; min-width: 0; }
        .dp-task-title { font-size: 13px; line-height: 1.4; word-break: break-word; }
        .dp-task-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; margin-top: 4px; min-height: 14px; }
        .dp-chip { display: inline-flex; align-items: center; gap: 3px; color: var(--dsw-alias-label-secondary); font-size: 10px; white-space: nowrap; }
        .dp-chip.is-danger { color: var(--dsw-alias-state-error-primary); }
        .dp-chip-sync { color: var(--dsw-alias-brand-primary); }
        .dp-tag { display: inline-flex; align-items: center; padding: 1px 5px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 9px; max-width: 78px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-priority { width: 5px; height: 5px; border-radius: 50%; flex: none; margin-top: 7px; background: transparent; }
        .dp-priority.p1 { background: var(--dsw-alias-state-error-primary); }
        .dp-priority.p2 { background: var(--dsw-alias-state-warn-primary); }
        .dp-priority.p3 { background: var(--dsw-alias-state-idle-primary); }
        .dp-task-arrow { color: var(--dsw-alias-border-l2); flex: none; margin-top: 4px; opacity: 0; transition: opacity .12s ease; }
        .dp-task-grip { color: var(--dsw-alias-label-secondary); flex: none; margin-top: 4px; opacity: .45; cursor: grab; transition: opacity .12s ease; }
        .dp-task-wrap:hover .dp-task-grip { opacity: .85; }
        .dp-task:hover .dp-task-arrow { opacity: 1; }
        .dp-group-done { margin-top: 3px; border-top: 1px dashed var(--dsw-alias-border-l1); padding-top: 6px; }
        .dp-done-toggle { display: flex; align-items: center; gap: 5px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); padding: 4px 3px; font-size: 10px; text-align: left; }
        .dp-done-toggle:hover { color: var(--dsw-alias-label-primary); }
        .dp-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 34px 18px; color: var(--dsw-alias-label-secondary); }
        .dp-empty-icon { width: 42px; height: 42px; border-radius: 13px; display: inline-flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-brand-primary); margin-bottom: 10px; }
        .dp-empty-title { color: var(--dsw-alias-label-primary); font-weight: 600; font-size: 13px; margin-bottom: 4px; }
        .dp-empty-text { font-size: 11px; max-width: 240px; line-height: 1.6; }
        .dp-foot { display: flex; gap: 5px; justify-content: center; color: var(--dsw-alias-label-secondary); opacity: .6; font-size: 9px; margin-top: 18px; }
        .dp-muted { color: var(--dsw-alias-label-secondary); }
        .dp-hint { color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1.55; margin-top: 6px; }
        .dp-hint.is-warn { color: var(--dsw-alias-state-warn-primary); }
        .dp-btn { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border-radius: 7px; padding: 6px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
        .dp-btn:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
        .dsh-planner .dp-btn-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-bg-base)); }
        .dsh-planner .dp-btn-primary:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, var(--dsw-alias-label-primary)); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-bg-base)); }
        .dp-btn-small { padding: 4px 8px; font-size: 10px; }
        .dsh-planner .dp-btn-danger { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); color: var(--dsw-alias-state-error-primary); }
        .dsh-planner .dp-btn-danger:hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); }
        .dp-link-btn { border: 0; background: transparent; color: var(--dsw-alias-brand-primary); padding: 2px 0; font-size: 10px; display: inline-flex; align-items: center; gap: 3px; }
        .dp-link-btn:hover { text-decoration: underline; }
        .dp-danger-text { color: var(--dsw-alias-state-error-primary); }
        .dp-alert { display: flex; align-items: flex-start; gap: 6px; padding: 8px 9px; border-radius: 7px; font-size: 11px; line-height: 1.5; border: 1px solid var(--dsw-alias-border-l1); margin-bottom: 9px; }
        .dp-alert span { flex: 1; min-width: 0; }
        .dp-alert.is-error { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent); }
        .dp-alert.is-warn { color: var(--dsw-alias-state-warn-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 30%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 7%, transparent); }
        .dp-alert.is-success { color: var(--dsw-alias-state-success-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 30%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 7%, transparent); }
        .dp-alert-close { border: 0; background: transparent; color: currentColor; padding: 0; flex: none; opacity: .8; }
        .dp-toast { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); padding: 6px 11px; border-radius: 999px; font-size: 11px; box-shadow: 0 6px 22px var(--dsw-alias-border-l2); z-index: 10; white-space: nowrap; }
        .dp-centered { align-items: center; justify-content: center; padding: 24px; text-align: center; gap: 9px; }
        .dp-centered-title { font-size: 14px; font-weight: 600; }
        .dp-spinner { width: 20px; height: 20px; border: 2px solid var(--dsw-alias-border-l1); border-top-color: var(--dsw-alias-brand-primary); border-radius: 50%; animation: dp-spin 1s linear infinite; }
        .dp-spin { animation: dp-spin 1s linear infinite; }
        @keyframes dp-spin { to { transform: rotate(360deg); } }
        .dp-detail { flex: 1; min-height: 0; overflow-y: auto; padding: 11px 13px 24px; scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-l2) transparent; }
        .dp-detail-head { display: flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary); margin-bottom: 9px; }
        .dp-detail-eyebrow { font-size: 10px; letter-spacing: .04em; }
        .dp-detail-head-spacer { flex: 1; }
        .dp-detail-title-row { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 5px; }
        .dp-title-input { flex: 1; background: transparent; border: 1px solid transparent; padding: 2px 4px 3px; font-size: 17px; font-weight: 650; line-height: 1.35; box-shadow: none; min-width: 0; }
        .dp-title-input:hover { border-color: var(--dsw-alias-border-l1); }
        .dp-title-input:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
        .dp-title-input.is-done { color: var(--dsw-alias-label-secondary); text-decoration: line-through; }
        .dp-parent-link { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 10px; padding: 1px 3px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-parent-link:hover { color: var(--dsw-alias-brand-primary); }
        .dp-done-note { display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, transparent); border-radius: 5px; padding: 3px 7px; font-size: 10px; margin: 4px 0 2px; }
        .dp-actual-section { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 24%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 4%, var(--dsw-alias-bg-layer-1)); }
        .dp-actual-section .dp-metric { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, var(--dsw-alias-bg-layer-2)); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, var(--dsw-alias-border-l1)); }
        .dp-actual-section .dp-metric strong { color: var(--dsw-alias-state-success-primary); font-size: 14px; font-variant-numeric: tabular-nums; }
        .dp-immutable-note { display: flex; align-items: flex-start; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1.5; border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 4%, transparent); }
        .dp-immutable-note svg { flex: none; margin-top: 1px; color: var(--dsw-alias-state-success-primary); }
        .dp-auto-badge { display: inline-flex; align-items: center; gap: 3px; padding: 3px 6px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 26%, transparent); color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 7%, transparent); font-size: 8px; letter-spacing: .04em; }
        .dp-section { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; padding: 11px; margin-top: 11px; }
        .dp-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
        .dp-section-head .dp-label { margin-bottom: 0; }
        .dp-label { display: flex; align-items: center; gap: 5px; color: var(--dsw-alias-label-secondary); font-size: 10px; font-weight: 600; letter-spacing: .02em; margin-bottom: 7px; }
        .dp-label svg { opacity: .85; }
        .dp-textarea { width: 100%; background: var(--dsw-alias-bg-layer-1); font-size: 12px; }
        .dp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .dp-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 10px; }
        .dp-field input, .dp-field select { width: 100%; font-size: 11px; padding: 6px 7px; }
        .dp-field-wide { grid-column: 1 / -1; }
        .dp-progress-summary { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px 9px; margin-bottom: 8px; }
        .dp-progress-summary-top { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-bottom: 6px; }
        .dp-progress-num { font-size: 16px; font-weight: 650; }
        .dp-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .dp-toggle-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
        .dp-toggle-inline { flex: none; gap: 5px; }
        .dp-auto-hint { margin-top: 7px; }
        .dp-switch { width: 30px; height: 17px; appearance: none; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l2); position: relative; flex: none; cursor: pointer; transition: background .15s ease; }
        .dp-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: var(--dsw-alias-label-secondary); transition: transform .15s ease, background .15s ease; }
        .dp-switch:checked { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
        .dsh-planner .dp-switch:checked::after { transform: translateX(13px); background: var(--dsw-alias-label-primary-inverted, var(--dsw-alias-bg-base)); }
        .dp-subtasks { display: flex; flex-direction: column; gap: 2px; }
        .dp-subtask { display: flex; align-items: center; gap: 7px; padding: 4px 2px; border-radius: 5px; }
        .dp-subtask:hover { background: var(--dsw-alias-bg-layer-1); }
        .dp-subtask-title { border: 0; background: transparent; text-align: left; flex: 1; min-width: 0; padding: 2px 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-subtask-title:hover { color: var(--dsw-alias-brand-primary); }
        .dp-subtask-title.is-done { color: var(--dsw-alias-label-secondary); text-decoration: line-through; }
        .dp-subtask-date { color: var(--dsw-alias-label-secondary); font-size: 10px; flex: none; }
        .dp-sub-add { display: flex; align-items: center; gap: 5px; margin-top: 5px; padding: 3px 3px 3px 5px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 6px; color: var(--dsw-alias-label-secondary); }
        .dp-sub-add input { flex: 1; border: 0; background: transparent; padding: 3px 0; font-size: 11px; box-shadow: none; }
        .dp-sub-add input:focus { box-shadow: none; }
        .dp-danger-zone { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .dp-confirm { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 10px; color: var(--dsw-alias-label-secondary); }
        .dp-meta-line { color: var(--dsw-alias-label-secondary); opacity: .65; font-size: 9px; margin-left: auto; }
        .dp-review { padding: 12px 13px 22px; }
        .dp-review-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
        .dp-segmented { display: inline-flex; padding: 2px; border-radius: 7px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); }
        .dp-segmented button { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 5px; padding: 4px 8px; font-size: 10px; }
        .dp-segmented button.is-active { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 3px var(--dsw-alias-border-l2); }
        .dp-segmented-small button { padding: 4px 7px; }
        .dp-login-modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; }
        .dp-login-modes button { min-width: 0; padding: 5px 4px; white-space: nowrap; }
        .dp-review-nav { display: flex; align-items: center; gap: 1px; }
        .dp-review-date { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 10px; padding: 4px 5px; white-space: nowrap; }
        .dp-review-date:hover { color: var(--dsw-alias-label-primary); }
        .dp-insight { margin-top: 11px; padding: 10px 1px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
        .dp-insight-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .dp-insight .dp-label { margin-bottom: 2px; }
        .dp-insight-caption { color: var(--dsw-alias-label-secondary); font-size: 9px; }
        .dp-streak { display: inline-flex; align-items: center; gap: 3px; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); border-radius: 999px; padding: 2px 7px; font-size: 9px; white-space: nowrap; }
        .dp-chart { display: flex; align-items: flex-end; gap: 6px; height: 62px; margin-top: 8px; }
        .dp-chart-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .dp-chart-track { width: 100%; flex: 1; min-height: 0; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; display: flex; align-items: flex-end; overflow: hidden; }
        .dp-chart-bar { width: 100%; min-height: 2px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent); border-radius: 3px 3px 0 0; transition: height .25s ease; }
        .dp-chart-bar.is-full { background: var(--dsw-alias-brand-primary); }
        .dp-chart-label { color: var(--dsw-alias-label-secondary); font-size: 8px; line-height: 1; }
        .dp-chart-label.is-today { color: var(--dsw-alias-brand-primary); font-weight: 650; }
        .dp-review-hero { display: flex; align-items: center; gap: 14px; padding: 15px 3px 4px; }
        .dp-ring { position: relative; flex: none; }
        .dp-ring svg { display: block; }
        .dp-ring-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 650; color: var(--dsw-alias-label-primary); }
        .dp-review-hero-copy { min-width: 0; }
        .dp-review-big { font-size: 22px; font-weight: 650; letter-spacing: -.02em; }
        .dp-review-sub { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-top: 5px; }
        .dp-rating-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .dp-stars { display: flex; gap: 1px; }
        .dp-stars button { border: 0; background: transparent; color: var(--dsw-alias-border-l2); padding: 1px; font-size: 19px; line-height: 1; }
        .dp-stars button.is-on { color: var(--dsw-alias-state-warn-primary); }
        .dp-review-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
        .dp-review-list { display: flex; flex-direction: column; gap: 1px; }
        .dp-review-task { display: flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 4px 2px; text-align: left; font-size: 11px; }
        .dp-review-task:hover { background: var(--dsw-alias-bg-layer-1); }
        .dp-review-check { width: 16px; height: 16px; border-radius: 5px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); color: var(--dsw-alias-brand-primary); display: inline-flex; align-items: center; justify-content: center; flex: none; }
        .dp-review-task-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-review-history { display: flex; flex-direction: column; gap: 6px; }
        .dp-history-item { border-left: 2px solid var(--dsw-alias-border-l1); padding: 2px 0 3px 8px; }
        .dp-history-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 9px; }
        .dp-history-rating { color: var(--dsw-alias-state-warn-primary); letter-spacing: 1px; }
        .dp-history-item p { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .dp-sync { padding: 12px 13px 22px; }
        .dp-sync-hero { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
        .dp-sync-hero > div { min-width: 0; flex: 1; }
        .dp-sync-hero h2 { font-size: 14px; font-weight: 650; }
        .dp-sync-hero p { color: var(--dsw-alias-label-secondary); font-size: 10px; margin-top: 1px; }
        .dp-sync-logo { width: 38px; height: 38px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; flex: none; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
        .dp-sync-logo.is-connected { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, transparent); }
        .dp-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); flex: none; }
        .dp-status-dot.is-on { background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }
        .dp-conn-card, .dp-conn-form { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 9px; padding: 9px; margin-bottom: 12px; }
        .dp-conn-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 7px; }
        .dp-conn-account { font-size: 12px; font-weight: 600; }
        .dp-conn-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
        .dp-inline-confirm { display: flex; align-items: center; gap: 3px; font-size: 10px; color: var(--dsw-alias-label-secondary); }
        .dp-conn-form-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .dp-form-actions { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
        .dp-alert + .dp-conn-card, .dp-alert + .dp-conn-form { margin-top: 2px; }
        .dp-activity-list { display: flex; flex-direction: column; gap: 1px; }
        .dp-activity { display: flex; align-items: center; gap: 7px; padding: 5px 2px; border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 55%, transparent); }
        .dp-activity:last-child { border-bottom: 0; }
        .dp-sport { width: 24px; height: 24px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; flex: none; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-brand-primary); }
        .dp-sport-sync { color: var(--dsw-alias-state-success-primary); }
        .dp-activity-mid { flex: 1; min-width: 0; }
        .dp-activity-title { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-activity-meta { color: var(--dsw-alias-label-secondary); font-size: 9px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-activity-match { color: var(--dsw-alias-brand-primary); font-size: 9px; flex: none; max-width: 94px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-activity-raw { font-size: 9px; flex: none; }
        .dp-disclosure { display: flex; align-items: center; gap: 5px; width: 100%; border: 0; background: transparent; color: var(--dsw-alias-label-primary); padding: 2px 0; text-align: left; font-size: 11px; }
        .dp-disclosure .dp-muted { margin-left: auto; font-size: 9px; }
        .dp-import { margin-top: 7px; }
        .dp-json-input { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; }
        .dp-token-input { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; }
        .dp-title-slot { display: inline-flex; align-items: center; gap: 4px; }
        .dp-mode-tabs { margin: 8px 12px 0; padding: 3px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); gap: 2px; }
        .dp-mode-tabs .dp-tab { flex: 1; padding: 6px 4px; text-align: center; }
        .dp-mode-tabs .dp-tab.is-active { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-bg-base) 35%, transparent); }
        .dp-tab-dot { display: inline-block; width: 4px; height: 4px; margin-left: 4px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); vertical-align: middle; }
        .dp-daterail { flex: none; padding: 1px 12px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
        .dp-week-nav { display: flex; align-items: center; justify-content: space-between; gap: 2px; margin-bottom: 4px; }
        .dp-week-arrow { width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); display: inline-flex; align-items: center; justify-content: center; padding: 0; }
        .dp-week-arrow:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
        .dp-week-title { flex: 1; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 10px; padding: 3px 4px; text-align: center; white-space: nowrap; }
        .dp-week-title:hover { color: var(--dsw-alias-label-primary); }
        .dp-week-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .dp-day { border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 5px 1px 4px; min-width: 0; }
        .dp-day:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
        .dp-day.is-past { opacity: .72; }
        .dp-day.is-today { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent); }
        .dp-day.is-active { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 11%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, transparent); color: var(--dsw-alias-label-primary); }
        .dp-day-wd { font-size: 9px; line-height: 1.2; }
        .dp-day-num { font-size: 13px; font-weight: 650; line-height: 1.25; font-variant-numeric: tabular-nums; }
        .dp-day-dots { display: flex; gap: 2px; height: 4px; align-items: center; }
        .dp-day-dots i { width: 3px; height: 3px; border-radius: 50%; background: var(--dsw-alias-border-l2); display: block; }
        .dp-day-dots i.is-done { background: var(--dsw-alias-state-success-primary); }
        .dp-day-dots i.is-review { background: var(--dsw-alias-brand-primary); }
        .dp-day-summary { display: flex; align-items: center; gap: 10px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; padding: 9px 10px; margin-bottom: 9px; }
        .dp-day-summary-main { flex: 1; min-width: 0; }
        .dp-day-summary-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px; }
        .dp-day-summary-count { font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
        .dp-day-summary-bar { height: 4px; }
        .dp-day-summary-caption { color: var(--dsw-alias-label-secondary); font-size: 9px; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-day-summary-side { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
        .dp-eyebrow { color: var(--dsw-alias-label-secondary); font-size: 9px; font-weight: 600; letter-spacing: .05em; }
        .dp-coach-chip { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 999px; font-size: 9px; white-space: nowrap; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-base); }
        .dp-coach-chip.is-ok { color: var(--dsw-alias-state-success-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 30%, transparent); }
        .dp-coach-chip.is-warn { color: var(--dsw-alias-state-warn-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 32%, transparent); }
        .dp-coach-chip.is-idle { color: var(--dsw-alias-label-secondary); }
        .dp-ball-section { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); border-radius: 12px; padding: 10px; margin-bottom: 10px; }
        .dp-ball-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; padding: 0 1px 7px; }
        .dp-ball-head .dp-label { margin-bottom: 2px; }
        .dp-ball-sub { color: var(--dsw-alias-label-secondary); font-size: 9px; line-height: 1.45; }
        .dp-ball-count { flex: none; color: var(--dsw-alias-state-success-primary); font-size: 9px; }
        .dp-ball-field { position: relative; flex: 1; min-height: 280px; height: clamp(280px, 46vh, 520px); border-radius: 10px; background-color: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent); background-image: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent), transparent 68%), radial-gradient(var(--dsw-alias-border-l1) 0.7px, transparent 0.8px); background-size: auto, 18px 18px; overflow: hidden; touch-action: none; }
        .dp-ball { --dp-ball-color: var(--dsw-alias-brand-primary); position: absolute; width: var(--dp-ball-size, 48px); height: var(--dp-ball-size, 48px); transform: translate(-50%, -50%) scale(var(--dp-sx, 1), var(--dp-sy, 1)); transform-origin: 50% 60%; border: 1px solid color-mix(in srgb, var(--dp-ball-color) 48%, transparent); border-radius: 50%; background: radial-gradient(circle at 31% 24%, color-mix(in srgb, white 88%, transparent) 0%, color-mix(in srgb, white 22%, transparent) 13%, transparent 30%), radial-gradient(circle at 68% 76%, color-mix(in srgb, var(--dp-ball-color) 34%, transparent), transparent 48%), radial-gradient(circle at 50% 48%, color-mix(in srgb, var(--dp-ball-color) 10%, transparent), transparent 68%); box-shadow: inset 5px 7px 12px color-mix(in srgb, white 10%, transparent), inset -7px -9px 15px color-mix(in srgb, var(--dp-ball-color) 14%, transparent), 0 8px 22px color-mix(in srgb, var(--dp-ball-color) 12%, transparent); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; padding: 0; z-index: 1; touch-action: none; user-select: none; color: transparent; overflow: visible; animation: dp-ball-glow 5.5s ease-in-out infinite; }
        .dp-ball::before { content: ''; position: absolute; left: 19%; top: 11%; width: 33%; height: 24%; border-radius: 50%; background: radial-gradient(ellipse, color-mix(in srgb, white 72%, transparent), transparent 72%); filter: blur(.4px); transform: rotate(-24deg); opacity: .8; pointer-events: none; }
        .dp-ball::after { content: ''; position: absolute; inset: 5px; border-radius: 50%; border: 1px solid color-mix(in srgb, white 14%, transparent); box-shadow: inset 0 0 10px color-mix(in srgb, var(--dp-ball-color) 16%, transparent); pointer-events: none; }
        .dp-ball:nth-child(2n) { animation-delay: -1.7s; }
        .dp-ball:nth-child(3n) { animation-delay: -3.1s; }
        .dp-ball--brand { --dp-ball-color: var(--dsw-alias-brand-primary); }
        .dp-ball--success { --dp-ball-color: var(--dsw-alias-state-success-primary); }
        .dp-ball--idle { --dp-ball-color: var(--dsw-alias-state-idle-primary); }
        .dp-ball--warn { --dp-ball-color: var(--dsw-alias-state-warn-primary); }
        .dp-ball--error { --dp-ball-color: var(--dsw-alias-state-error-primary); }
        .dp-ball--muted { --dp-ball-color: var(--dsw-alias-label-secondary); }
        .dp-ball.is-plan { background: radial-gradient(circle at 31% 24%, color-mix(in srgb, white 50%, transparent), transparent 18%), radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--dp-ball-color) 8%, transparent), transparent 66%); border: 1px dashed color-mix(in srgb, var(--dp-ball-color) 62%, transparent); box-shadow: inset 0 0 14px color-mix(in srgb, var(--dp-ball-color) 9%, transparent), 0 6px 18px color-mix(in srgb, var(--dp-ball-color) 8%, transparent); opacity: .88; }
        .dp-ball.is-actual { background: radial-gradient(circle at 31% 24%, color-mix(in srgb, white 86%, transparent), transparent 16%), radial-gradient(circle at 67% 74%, color-mix(in srgb, var(--dp-ball-color) 42%, transparent), transparent 48%), radial-gradient(circle at 50% 52%, color-mix(in srgb, var(--dp-ball-color) 22%, transparent), transparent 76%); border: 1px solid color-mix(in srgb, var(--dp-ball-color) 64%, transparent); box-shadow: inset 4px 6px 12px color-mix(in srgb, white 14%, transparent), inset -7px -8px 14px color-mix(in srgb, var(--dp-ball-color) 24%, transparent), 0 9px 24px color-mix(in srgb, var(--dp-ball-color) 22%, transparent); z-index: 2; }
        .dp-ball.is-green { width: calc(var(--dp-ball-size, 48px) + 12px); height: calc(var(--dp-ball-size, 48px) + 12px); background: radial-gradient(circle at 30% 24%, color-mix(in srgb, white 78%, transparent), transparent 16%), radial-gradient(circle at 66% 74%, color-mix(in srgb, var(--dsw-alias-state-success-primary) 50%, transparent), transparent 50%), radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--dsw-alias-state-success-primary) 30%, transparent), transparent 72%); border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 76%, white 8%); box-shadow: inset 5px 7px 14px color-mix(in srgb, white 20%, transparent), inset -7px -9px 16px color-mix(in srgb, var(--dsw-alias-state-success-primary) 30%, transparent), 0 10px 26px color-mix(in srgb, var(--dsw-alias-state-success-primary) 30%, transparent); z-index: 3; animation: dp-ball-pop .32s ease-out; }
        .dp-ball.is-dragging { z-index: 5; cursor: grabbing; box-shadow: inset 4px 6px 12px color-mix(in srgb, white 18%, transparent), inset -8px -10px 16px color-mix(in srgb, var(--dp-ball-color) 22%, transparent), 0 16px 30px color-mix(in srgb, var(--dsw-alias-bg-base) 52%, transparent); animation-play-state: paused; }
        .dp-ball:not(.is-dragging) { cursor: grab; }
        .dp-ball:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 3px; }
        .dp-ball-empty { min-height: 220px; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 10px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 9px; }
        .dp-cell-merge { --dp-cell-color: var(--dsw-alias-brand-primary); position: absolute; width: 0; height: 0; pointer-events: none; z-index: 7; transform: translate(-50%, -50%); }
        .dp-cell-merge.is-brand { --dp-cell-color: var(--dsw-alias-brand-primary); }
        .dp-cell-merge.is-success { --dp-cell-color: var(--dsw-alias-state-success-primary); }
        .dp-cell-merge.is-idle { --dp-cell-color: var(--dsw-alias-state-idle-primary); }
        .dp-cell-merge.is-warn { --dp-cell-color: var(--dsw-alias-state-warn-primary); }
        .dp-cell-merge.is-error { --dp-cell-color: var(--dsw-alias-state-error-primary); }
        .dp-cell-merge.is-muted { --dp-cell-color: var(--dsw-alias-label-secondary); }
        .dp-cell-merge i { position: absolute; left: 0; top: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); animation: dp-cell-particle .9s ease-out forwards; animation-delay: calc(var(--dp-particle-angle) / 500); }
        .dp-cell-merge-plan, .dp-cell-merge-actual, .dp-cell-merge-green { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); border-radius: 50%; }
        .dp-cell-merge-plan { width: 34px; height: 34px; border: 2px dashed var(--dp-cell-color); background: color-mix(in srgb, var(--dp-cell-color) 10%, transparent); animation: dp-cell-left .92s ease-in forwards; }
        .dp-cell-merge-actual { width: 34px; height: 34px; background: var(--dp-cell-color); animation: dp-cell-right .92s ease-in forwards; }
        .dp-cell-merge-green { width: 54px; height: 54px; background: var(--dsw-alias-state-success-primary); opacity: 0; animation: dp-cell-green .92s ease-out .08s forwards; }
        @keyframes dp-cell-left { 0% { transform: translate(-50%, -50%) translateX(-17px) scale(1); opacity: .9; } 70% { transform: translate(-50%, -50%) translateX(0) scale(.72); opacity: .8; } 100% { transform: translate(-50%, -50%) scale(0); opacity: 0; } }
        @keyframes dp-cell-right { 0% { transform: translate(-50%, -50%) translateX(17px) scale(1); opacity: .95; } 70% { transform: translate(-50%, -50%) translateX(0) scale(.7); opacity: .85; } 100% { transform: translate(-50%, -50%) scale(0); opacity: 0; } }
        @keyframes dp-cell-green { 0% { transform: translate(-50%, -50%) scale(.35); opacity: 0; } 55% { transform: translate(-50%, -50%) scale(1.18); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1); opacity: .42; } }
        @keyframes dp-cell-particle { 0% { transform: translate(-50%, -50%) rotate(var(--dp-particle-angle)) translateX(4px) scale(1); opacity: .95; } 100% { transform: translate(-50%, -50%) rotate(var(--dp-particle-angle)) translateX(32px) scale(.1); opacity: 0; } }
        @keyframes dp-ball-glow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.08); } }
        @keyframes dp-ball-breathe { 0%, 100% { border-radius: 47% 53% 51% 49% / 52% 46% 54% 48%; } 50% { border-radius: 53% 47% 48% 52% / 47% 53% 48% 52%; } }
        @keyframes dp-ball-burst { 0% { transform: translate(-50%, -50%) scale(.5); opacity: .95; } 100% { transform: translate(-50%, -50%) scale(3.2); opacity: 0; } }
        @keyframes dp-ball-pop { 0% { transform: translate(-50%, -50%) scale(.55); opacity: .2; } 70% { transform: translate(-50%, -50%) scale(1.08); } 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
        .dp-day-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 2px; }
        .dp-day-title { font-size: 16px; font-weight: 650; margin-top: 1px; }
        .dp-day-nav { display: flex; align-items: center; gap: 1px; flex: none; }
        .dp-dayreview .dp-review-hero { padding-top: 10px; }
        .dp-review-plan-btn { margin-top: 7px; }
        .dp-scale-grid { display: flex; flex-direction: column; gap: 7px; }
        .dp-scale-row { display: grid; grid-template-columns: 82px 1fr 62px; align-items: center; gap: 7px; }
        .dp-scale-label { display: flex; flex-direction: column; min-width: 0; }
        .dp-scale-label span { font-size: 11px; color: var(--dsw-alias-label-primary); }
        .dp-scale-label small { color: var(--dsw-alias-label-secondary); font-size: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-scale-dots { display: flex; gap: 3px; }
        .dp-scale-dots button { flex: 1; height: 23px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 0; font-size: 9px; }
        .dp-scale-dots button:hover { border-color: var(--dsw-alias-border-l2); }
        .dp-scale-dots button.is-on { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, transparent); color: var(--dsw-alias-label-primary); font-weight: 650; }
        .dp-scale-ends { color: var(--dsw-alias-label-secondary); font-size: 8px; text-align: right; white-space: nowrap; }
        .dp-metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
        .dp-metric-grid.is-wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .dp-metric { background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; padding: 8px 9px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .dp-metric > span { color: var(--dsw-alias-label-secondary); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dp-metric > b { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
        .dp-metric > b.is-warn { color: var(--dsw-alias-state-warn-primary); }
        .dp-metric > small { color: var(--dsw-alias-label-secondary); font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dp-mini-chart-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 9px 0 5px; color: var(--dsw-alias-label-secondary); font-size: 9px; }
        .dp-load-chart { display: flex; align-items: flex-end; gap: 4px; height: 58px; border-bottom: 1px solid var(--dsw-alias-border-l1); padding: 0 1px; }
        .dp-load-chart.is-coach { height: 72px; }
        .dp-load-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; }
        .dp-load-track { width: 100%; flex: 1; display: flex; align-items: flex-end; justify-content: center; }
        .dp-load-bar { display: block; width: 62%; max-width: 16px; min-height: 2px; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 48%, transparent); }
        .dp-load-bar.is-high { background: var(--dsw-alias-state-warn-primary); }
        .dp-load-bar.is-active { background: var(--dsw-alias-brand-primary); }
        .dp-load-label { color: var(--dsw-alias-label-secondary); font-size: 7px; line-height: 1.2; }
        .dp-load-label.is-active { color: var(--dsw-alias-label-primary); font-weight: 650; }
        .dp-coach-note { color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 1.5; margin-top: 7px; }
        .dp-coach { padding: 12px 13px 24px; }
        .dp-coach-hero { display: flex; align-items: center; gap: 13px; padding: 4px 1px 2px; }
        .dp-coach-hero-copy { min-width: 0; }
        .dp-coach-hero-copy h2 { font-size: 19px; font-weight: 650; margin: 1px 0 3px; }
        .dp-coach-hero-copy p { font-size: 10px; line-height: 1.5; }
        .dp-coach-pills { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
        .dp-pill { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 999px; padding: 2px 6px; color: var(--dsw-alias-label-secondary); font-size: 8px; }
        .dp-coach-actions { display: flex; align-items: center; justify-content: space-between; gap: 7px; border-bottom: 1px solid var(--dsw-alias-border-l1); padding: 8px 0 10px; margin-bottom: 2px; }
        .dp-advice-list { display: flex; flex-direction: column; gap: 5px; }
        .dp-advice { border: 1px solid var(--dsw-alias-border-l1); border-left: 2px solid var(--dsw-alias-label-secondary); border-radius: 7px; padding: 7px 8px; background: var(--dsw-alias-bg-layer-1); }
        .dp-advice.is-high { border-left-color: var(--dsw-alias-state-error-primary); }
        .dp-advice.is-mid { border-left-color: var(--dsw-alias-state-warn-primary); }
        .dp-advice.is-ok { border-left-color: var(--dsw-alias-state-success-primary); }
        .dp-advice-title { font-size: 10px; font-weight: 650; margin-bottom: 2px; }
        .dp-advice p { color: var(--dsw-alias-label-secondary); font-size: 9px; line-height: 1.5; }
        .dp-prediction-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
        .dp-prediction { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); border-radius: 8px; padding: 7px 6px; display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 0; }
        .dp-prediction span { color: var(--dsw-alias-label-secondary); font-size: 8px; }
        .dp-prediction b { font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .dp-prediction small { color: var(--dsw-alias-label-secondary); font-size: 7px; white-space: nowrap; }
        .dp-prediction-note { font-size: 8px; line-height: 1.45; margin-top: 5px; }
        .dp-activity-list { display: flex; flex-direction: column; gap: 1px; }
        .dp-activity-row { display: flex; align-items: center; gap: 7px; padding: 6px 3px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
        .dp-activity-row:last-child { border-bottom: 0; }
        .dp-activity-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--dsw-alias-brand-primary); flex: none; }
        .dp-activity-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .dp-activity-main span { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-activity-main small { color: var(--dsw-alias-label-secondary); font-size: 8px; }
        .dp-activity-load { flex: none; font-size: 9px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
        .dp-save-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
        .dp-saved-note { color: var(--dsw-alias-state-success-primary); font-size: 9px; }
        .dp-field-row { display: flex; gap: 7px; margin-top: 7px; }
        .dp-field-narrow { width: 86px; flex: none; }
        .dp-training-note { align-items: flex-end; }
        .dp-training-note .dp-field { flex: 1; }
        @media (max-width: 360px) {
          .dp-overview { grid-template-columns: 1fr; }
          .dp-form-grid { grid-template-columns: 1fr; }
          .dp-field-wide { grid-column: auto; }
          .dp-review-hero { gap: 10px; }
          .dp-review-big { font-size: 19px; }
          .dp-task-arrow { display: none; }
          .dp-scale-row { grid-template-columns: 70px 1fr; }
          .dp-scale-ends { display: none; }
          .dp-metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dp-prediction-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .dp-week-days { gap: 0; }
          .dp-ball-field { height: clamp(240px, 40vh, 380px); min-height: 240px; }
          .dp-day-summary { align-items: flex-start; }
          .dp-day-summary-side { flex-direction: column; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dp-ball, .dp-ball-burst, .dp-cell-merge-plan, .dp-cell-merge-actual, .dp-cell-merge-green, .dp-cell-merge i { animation: none !important; transition: none !important; }
        }
      `
      document.head.appendChild(style)
      return () => { style.remove() }
    }

    // ---------------------------------------------------------------- plugin glue

    function disposeSafely(target) {
      try {
        if (typeof target === 'function') target()
        else if (target && typeof target.dispose === 'function') target.dispose()
      } catch { /* already disposed */ }
    }

    function apply(ctx) {
      ctx.effect(() => injectStyles(), 'dsh-rundiag: styles')

      // The right-bar seat declares its tab-body slots BEFORE it provides
      // `sidebarRightTabs`. Wait for the registry itself, then install the tab
      // type and both slots as one disposable unit, so a reload or a slow
      // service start cannot leave a half-registration behind.
      ctx.effect(() => {
        const seat = ctx.inject(['sidebarRightTabs'], (injected) => {
          const tabs = injected.get('sidebarRightTabs')
          if (!tabs) return

          const disposeType = tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            keepMounted: true,
            priority: 'extension',
            title: () => 'rundiag',
            guide: [{
              id: TAB_KIND,
              order: 18,
              title: () => 'rundiag',
              description: () => '任务、子任务、复盘与运动同步',
              icon: (props) => h(Icon, { name: 'check', size: props?.size || 16 })
            }]
          })

          const disposers = []
          try {
            disposers.push(ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: TAB_ID,
              inject: () => ({})
            }, PlannerBody)))
            disposers.push(ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
              name: 'sidebar.right.pane.tab.title',
              key: TAB_ID
            }, PlannerTitle)))
          } catch (error) {
            for (const dispose of disposers) disposeSafely(dispose)
            disposeSafely(disposeType)
            throw error
          }

          return () => {
            for (const dispose of disposers.reverse()) disposeSafely(dispose)
            disposeSafely(disposeType)
          }
        })
        return () => disposeSafely(seat)
      }, 'dsh-rundiag: native tab')
    }

    function TaskDetail({ task, tasks, index, onBack, onOpen, onUpdate, onToggle, onDelete, onAddSubtask }) {
      const children = index.childrenOf(task.id)
      const parent = task.parentId ? tasks.find((row) => row.id === task.parentId) : null
      const done = index.isDone(task)
      const progress = index.progress(task)
      const isParent = children.length > 0
      const [title, setTitle] = useState(task.title)
      const [notes, setNotes] = useState(task.notes || '')
      const [tags, setTags] = useState((task.tags || []).join(', '))
      const [keyword, setKeyword] = useState(task.autoSync?.keyword || '')
      const [target, setTarget] = useState(String(task.progress?.target || 1))
      const [current, setCurrent] = useState(String(task.progress?.current || 0))
      const [subtask, setSubtask] = useState('')
      const [confirmDelete, setConfirmDelete] = useState(false)

      useEffect(() => {
        setTitle(task.title)
        setNotes(task.notes || '')
        setTags((task.tags || []).join(', '))
        setKeyword(task.autoSync?.keyword || '')
        setTarget(String(task.progress?.target || 1))
        setCurrent(String(task.progress?.current || 0))
        setConfirmDelete(false)
        setSubtask('')
      }, [task.id])

      useEffect(() => {
        setTarget(String(task.progress?.target || 1))
        setCurrent(String(task.progress?.current || 0))
      }, [task.progress?.mode, task.progress?.target, task.progress?.current])

      function commitTitle() {
        const value = title.trim()
        if (!value) {
          setTitle(task.title)
          return
        }
        if (value !== task.title) onUpdate(task.id, { title: value })
      }

      function commitNotes() {
        if (notes !== (task.notes || '')) onUpdate(task.id, { notes })
      }

      function commitTags() {
        const next = parseTags(tags)
        const currentTags = task.tags || []
        if (next.join('|') !== currentTags.join('|')) onUpdate(task.id, { tags: next })
      }

      function commitKeyword() {
        if (keyword !== (task.autoSync?.keyword || '')) {
          onUpdate(task.id, { autoSync: { ...task.autoSync, keyword } })
        }
      }

      function changeMode(mode) {
        const nextUnit = mode === task.progress.mode ? task.progress.unit : defaultUnit(mode)
        const nextTarget = mode === 'check' ? 1 : Math.max(1, Number(target) || 1)
        setTarget(String(nextTarget))
        onUpdate(task.id, { progress: { mode, target: nextTarget, unit: nextUnit } })
      }

      function commitTarget() {
        const value = Math.max(1, Number(target) || 1)
        setTarget(String(value))
        onUpdate(task.id, { progress: { target: value } })
      }

      function commitCurrent() {
        const value = Math.max(0, Number(current) || 0)
        setCurrent(String(value))
        onUpdate(task.id, { progress: { current: value } })
      }

      function addSubtask(event) {
        event.preventDefault()
        const value = subtask.trim()
        if (!value) return
        onAddSubtask(task.id, value)
        setSubtask('')
      }

      return h('div', { className: 'dp-detail' },
        h('div', { className: 'dp-detail-head' },
          h('button', { type: 'button', className: 'dp-icon-btn', onClick: onBack, title: '返回列表', 'aria-label': '返回列表' },
            h(Icon, { name: 'arrowLeft', size: 17 })
          ),
          h('span', { className: 'dp-detail-eyebrow' }, parent ? '子任务' : '任务'),
          h('div', { className: 'dp-detail-head-spacer' }),
          task.autoGenerated
            ? h('span', { className: 'dp-auto-badge' }, h(Icon, { name: 'sync', size: 11 }), 'COROS')
            : h('button', {
              type: 'button',
              className: `dp-icon-btn${done ? ' is-success' : ''}`,
              onClick: () => onToggle(task.id, !done),
              title: done ? '标记为未完成' : '标记为完成'
            }, h(Icon, { name: done ? 'check' : 'target', size: 16 }))
        ),
        h('div', { className: 'dp-detail-title-row' },
          h(CheckButton, { done, size: 22, disabled: Boolean(task.autoGenerated), onClick: () => onToggle(task.id, !done) }),
          h('input', {
            className: `dp-title-input${done ? ' is-done' : ''}`,
            value: title,
            onChange: (event) => setTitle(event.target.value),
            onBlur: commitTitle,
            onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur() },
            'aria-label': '任务标题'
          })
        ),
        parent ? h('button', { type: 'button', className: 'dp-parent-link', onClick: () => onOpen(parent.id) },
          h(Icon, { name: 'list', size: 12 }),
          parent.title
        ) : null,
        done ? h('div', { className: 'dp-done-note' },
          h(Icon, { name: 'check', size: 13 }),
          `已完成${task.completedAt ? ` · ${new Date(task.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`
        ) : null,

        task.actual ? h('div', { className: 'dp-section dp-actual-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'chart', size: 13 }), '运动数据'),
          h('div', { className: 'dp-metric-grid' },
            task.actual.distanceKm ? h('div', { className: 'dp-metric' }, h('span', { className: 'dp-metric-label' }, '距离'), h('strong', null, `${round(task.actual.distanceKm, 2)} km`)) : null,
            task.actual.durationMin ? h('div', { className: 'dp-metric' }, h('span', { className: 'dp-metric-label' }, '时长'), h('strong', null, `${round(task.actual.durationMin)} 分钟`)) : null,
            task.actual.avgHr ? h('div', { className: 'dp-metric' }, h('span', { className: 'dp-metric-label' }, '平均心率'), h('strong', null, `${task.actual.avgHr} bpm`)) : null,
            task.actual.maxHr ? h('div', { className: 'dp-metric' }, h('span', { className: 'dp-metric-label' }, '最大心率'), h('strong', null, `${task.actual.maxHr} bpm`)) : null,
            task.actual.calories ? h('div', { className: 'dp-metric' }, h('span', { className: 'dp-metric-label' }, '消耗'), h('strong', null, `${task.actual.calories} kcal`)) : null,
            task.actual.trainingLoad ? h('div', { className: 'dp-metric' }, h('span', { className: 'dp-metric-label' }, '训练负荷'), h('strong', null, task.actual.trainingLoad)) : null,
            task.actual.elevationGain ? h('div', { className: 'dp-metric' }, h('span', { className: 'dp-metric-label' }, '爬升'), h('strong', null, `${task.actual.elevationGain} m`)) : null,
            task.actual.avgPower ? h('div', { className: 'dp-metric' }, h('span', { className: 'dp-metric-label' }, '平均功率'), h('strong', null, `${task.actual.avgPower} W`)) : null
          ),
          h('p', { className: 'dp-hint' }, task.autoGenerated
            ? '来自 COROS 的客观训练记录，会保留在数据球中，不能删除；可拖到计划球上融合。'
            : '已记录实际运动数据；把实际球拖到计划球上，可融合成绿色能量球。')
        ) : null,

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-section-head' },
            h('label', { className: 'dp-label' }, h(Icon, { name: 'note', size: 13 }), '描述'),
            h('button', {
              type: 'button',
              className: 'dp-link-btn',
              disabled: notes === (task.notes || ''),
              onClick: commitNotes,
              onMouseDown: (event) => event.preventDefault()
            }, notes !== (task.notes || '') ? '保存描述' : '已保存')
          ),
          h('textarea', {
            className: 'dp-textarea',
            rows: 4,
            placeholder: '补充背景、链接、验收标准或今天的感受…',
            value: notes,
            onChange: (event) => setNotes(event.target.value),
            onBlur: commitNotes
          })
        ),

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'calendar', size: 13 }), '日程与优先级'),
          h('div', { className: 'dp-form-grid' },
            h('label', { className: 'dp-field' }, h('span', null, '开始'),
              h('input', { type: 'date', value: task.startDate || '', onChange: (event) => onUpdate(task.id, { startDate: event.target.value }) })
            ),
            h('label', { className: 'dp-field' }, h('span', null, '截止'),
              h('input', { type: 'date', value: task.dueDate || '', onChange: (event) => onUpdate(task.id, { dueDate: event.target.value }) })
            ),
            h('label', { className: 'dp-field' }, h('span', null, '优先级'),
              h('select', {
                value: task.priority || 4,
                onChange: (event) => onUpdate(task.id, { priority: Number(event.target.value) })
              },
                [1, 2, 3, 4].map((value) => h('option', { value, key: value }, PRIORITY_LABELS[value]))
              )
            ),
            h('label', { className: 'dp-field' }, h('span', null, '类型'),
              h('select', {
                value: task.category || 'other',
                onChange: (event) => onUpdate(task.id, { category: event.target.value })
              },
                TASK_CATEGORIES.map(([id, label]) => h('option', { value: id, key: id }, label))
              )
            ),
            h('label', { className: 'dp-field dp-field-wide' }, h('span', null, '标签'),
              h('input', {
                value: tags,
                placeholder: '训练, 工作, 本周',
                onChange: (event) => setTags(event.target.value),
                onBlur: commitTags
              })
            )
          )
        ),

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' }, h(Icon, { name: 'target', size: 13 }), '完成度'),
          h('div', { className: 'dp-progress-summary' },
            h('div', { className: 'dp-progress-summary-top' },
              h('span', { className: 'dp-progress-num' }, `${clampPercent(progress.percent)}%`),
              h('span', { className: 'dp-muted' }, progress.label)
            ),
            h(Bar, { percent: progress.percent })
          ),
          isParent
            ? h('p', { className: 'dp-hint' }, '父任务的完成度由子任务自动汇总。勾选父任务会同时完成全部子任务。')
            : h('div', { className: 'dp-form-grid' },
              h('label', { className: 'dp-field' }, h('span', null, '计量方式'),
                h('select', { value: task.progress.mode, onChange: (event) => changeMode(event.target.value) },
                  h('option', { value: 'check' }, '勾选完成'),
                  h('option', { value: 'count' }, '次数'),
                  h('option', { value: 'distance' }, '距离'),
                  h('option', { value: 'duration' }, '时长')
                )
              ),
              task.progress.mode === 'check' ? null : h('label', { className: 'dp-field' }, h('span', null, '目标'),
                h('input', {
                  type: 'number', min: 1, step: 'any', value: target,
                  onChange: (event) => setTarget(event.target.value),
                  onBlur: commitTarget
                })
              ),
              task.progress.mode === 'check' ? null : h('label', { className: 'dp-field' }, h('span', null, '当前'),
                h('input', {
                  type: 'number', min: 0, step: 'any', value: current,
                  onChange: (event) => setCurrent(event.target.value),
                  onBlur: commitCurrent
                })
              ),
              task.progress.mode === 'check' ? null : h('label', { className: 'dp-field' }, h('span', null, '单位'),
                h('input', {
                  value: task.progress.unit || '',
                  placeholder: defaultUnit(task.progress.mode),
                  onChange: (event) => onUpdate(task.id, { progress: { unit: event.target.value } })
                })
              )
            ),
          !isParent && task.progress.mode !== 'check' ? h('button', {
            type: 'button',
            className: 'dp-link-btn',
            onClick: () => onUpdate(task.id, { progress: { current: 0 } })
          }, '重置当前进度') : null
        ),

        h('div', { className: 'dp-section dp-section-sync' },
          h('label', { className: 'dp-toggle-row' },
            h('span', { className: 'dp-label' }, h(Icon, { name: 'sync', size: 13 }), '自动同步运动数据'),
            h('input', {
              type: 'checkbox',
              className: 'dp-switch',
              checked: Boolean(task.autoSync?.enabled),
              onChange: (event) => onUpdate(task.id, { autoSync: { ...task.autoSync, enabled: event.target.checked } })
            })
          ),
          task.autoSync?.enabled ? h('div', { className: 'dp-form-grid' },
            h('label', { className: 'dp-field' }, h('span', null, '运动类型'),
              h('select', {
                value: task.autoSync.sport || 'all',
                onChange: (event) => onUpdate(task.id, { autoSync: { ...task.autoSync, sport: event.target.value } })
              }, SPORT_OPTIONS.map(([value, label]) => h('option', { value, key: value }, label)))
            ),
            h('label', { className: 'dp-field' }, h('span', null, '名称包含'),
              h('input', {
                value: keyword,
                placeholder: '可选，如：晨跑',
                onChange: (event) => setKeyword(event.target.value),
                onBlur: commitKeyword
              })
            )
          ) : null,
          task.autoSync?.enabled
            ? h('p', { className: `dp-hint${!task.dueDate && !task.startDate ? ' is-warn' : ''}` },
              !task.dueDate && !task.startDate
                ? '请先设置截止日期或开始日期，才能按日期窗口匹配活动。'
                : `匹配 ${task.startDate || task.dueDate} 至 ${task.dueDate || task.startDate} 的同类型活动，并按「${task.progress.mode === 'distance' ? '距离' : task.progress.mode === 'duration' ? '时长' : '次数'}」累加。`
            )
            : null
        ),

        h('div', { className: 'dp-section' },
          h('div', { className: 'dp-label' },
            h(Icon, { name: 'list', size: 13 }),
            `子任务${children.length ? ` · ${children.filter((child) => index.isDone(child)).length}/${children.length}` : ''}`
          ),
          children.length ? h('div', { className: 'dp-subtasks' },
            children.map((child) => h('div', { className: 'dp-subtask', key: child.id },
              h(CheckButton, { done: index.isDone(child), size: 16, onClick: () => onToggle(child.id, !index.isDone(child)) }),
              h('button', { type: 'button', className: `dp-subtask-title${index.isDone(child) ? ' is-done' : ''}`, onClick: () => onOpen(child.id) }, child.title),
              child.dueDate ? h('span', { className: 'dp-subtask-date' }, shortDate(child.dueDate)) : null
            ))
          ) : null,
          h('form', { className: 'dp-sub-add', onSubmit: addSubtask },
            h(Icon, { name: 'plus', size: 13 }),
            h('input', {
              value: subtask,
              placeholder: '添加子任务…',
              onChange: (event) => setSubtask(event.target.value)
            }),
            subtask.trim() ? h('button', { type: 'submit', className: 'dp-link-btn' }, '添加') : null
          ),
          h('p', { className: 'dp-hint' }, '子任务可单独设置截止日期、描述和自动同步规则。')
        ),

        task.autoGenerated ? h('div', { className: 'dp-section dp-immutable-note' },
          h(Icon, { name: 'sync', size: 13 }),
          h('span', null, '这条任务由 COROS 训练记录生成，不能删除；它的数据球会一直保留。')
        ) : h('div', { className: 'dp-section dp-danger-zone' },
          confirmDelete
            ? h('div', { className: 'dp-confirm' },
              h('span', null, '删除任务及其全部子任务？'),
              h('button', { type: 'button', className: 'dp-btn dp-btn-danger', onClick: () => onDelete(task.id) }, '删除'),
              h('button', { type: 'button', className: 'dp-btn', onClick: () => setConfirmDelete(false) }, '取消')
            )
            : h('button', { type: 'button', className: 'dp-link-btn dp-danger-text', onClick: () => setConfirmDelete(true) },
              h(Icon, { name: 'trash', size: 13 }),
              '删除任务'
            ),
          h('div', { className: 'dp-meta-line' },
            `创建于 ${new Date(task.createdAt).toLocaleDateString('zh-CN')}`,
            task.updatedAt ? ` · 更新于 ${new Date(task.updatedAt).toLocaleDateString('zh-CN')}` : ''
          )
        )
      )
    }

    return {
      name: 'dsh-rundiag',
      inject: ['slots'],
      apply
    }
  }
})

