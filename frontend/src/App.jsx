import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import * as XLSX from 'xlsx'

export default function App() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)


  // KPI dashboard state
  const today = new Date()
  const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)
  const lastOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const fmtDate = (d) => d.toISOString().slice(0, 10)

  const [periodStart, setPeriodStart] = useState(fmtDate(firstOfMonth(today)))
  const [periodEnd, setPeriodEnd] = useState(fmtDate(lastOfMonth(today)))
  const [kpiConfig, setKpiConfig] = useState(null)
  const [kpi, setKpi] = useState(null)
  const [kpiErr, setKpiErr] = useState(null)
  const [kpiBusy, setKpiBusy] = useState(false)
  const [testsJSON, setTestsJSON] = useState('[]')
  // FTE grouping removed from UI; using config/default only

  // Removed QTD/YTD UI; omitting related state to reduce unnecessary calls

  // Employee summary from local uploaded productivity only (Sheets flow removed)

  // Upload (local) productivity summary state
  const unifiedFileRef = useRef(null)
  const [uploadedProductivity, setUploadedProductivity] = useState([])
  const [uploadedEmpSummary, setUploadedEmpSummary] = useState([])
  const [uploadErr, setUploadErr] = useState(null)
  const [uploadBusy, setUploadBusy] = useState(false)

  // Hard cap on number of data rows to parse from uploads (affects all tables)
  const MAX_DATA_ROWS = 947

  // Simple client-side page routing
  const [activePage, setActivePage] = useState('dashboard')
  // Sorting state for Technician Evaluation table
  const [techSort, setTechSort] = useState({ key: 'cases', dir: 'desc' })
  // Sorting state for Reviewers and QC tables
  const [reviewSort, setReviewSort] = useState({ key: 'cases', dir: 'desc' })
  const [qcSort, setQcSort] = useState({ key: 'cases', dir: 'desc' })
  // Technician Evaluation card paging: 0 = table, 1 = chart
  const [techEvalPage, setTechEvalPage] = useState(0)


  const checkHealth = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/v1/health')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setHealth(data)
    } catch (e) {
      setError(e.message)
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }

  // Daily total volume bar chart (for custom range)
  const DailyVolumeBarChart = ({ rows = [] }) => {
    const data = Array.isArray(rows) ? rows : []
    const n = data.length
    const maxVal = Math.max(1, ...data.map(r => Number(r.total) || 0))
    // Dynamic bottom margin to accommodate labels; less for no-rotation, more for rotated
    const labelAngle = n <= 14 ? 0 : (n <= 31 ? 30 : (n <= 90 ? 40 : 45))
    const bottomLabelDepth = labelAngle === 0 ? 48 : (labelAngle === 30 ? 96 : (labelAngle === 40 ? 120 : 140))
    const margin = { top: 20, right: 20, bottom: bottomLabelDepth + 24, left: 44 }
    const innerH = 220
    const height = innerH + margin.top + margin.bottom
    // Dynamic step sizing to keep charts readable across small/large ranges
    const targetInnerW = 720
    const minStep = 8, maxStep = 48
    const step = Math.max(minStep, Math.min(maxStep, Math.floor(targetInnerW / Math.max(1, n))))
    const barW = Math.max(2, Math.floor(step * 0.65))
    const gap = Math.max(1, step - barW)
    const width = n * step + margin.left + margin.right
    const y = (v) => {
      const n = Number(v) || 0
      if (n <= 0) return innerH
      const h = (n / maxVal) * innerH
      return innerH - h
    }
    const ticks = 4
    const tickVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxVal * i) / ticks))
    const showLabel = (i, d) => {
      if (n <= 30) return true
      if (n <= 90) return i % 7 === 0
      // For large ranges, show first of month only
      return String(d?.date || '').slice(8, 10) === '01'
    }
    return (
      <div className="space-y-2">
        <div className="text-xs text-slate-600">Daily Total Volume</div>
        <div className="overflow-x-auto" style={{ overflowY: 'visible', paddingBottom: 24 }}>
          <svg width={width} height={height} role="img" aria-label="Daily cytogenetics volume" style={{ overflow: 'visible', display: 'block' }}>
            <g transform={`translate(${margin.left},${margin.top})`}>
              {tickVals.map((tv, i) => (
                <g key={i}>
                  <line x1={0} x2={width - margin.left - margin.right} y1={y(tv)} y2={y(tv)} stroke="#e5e7eb" strokeWidth="1" />
                  <text x={-8} y={y(tv)} textAnchor="end" fontSize="10" fill="#64748b">{tv}</text>
                </g>
              ))}
              {data.map((d, i) => {
                const x = i * step
                const val = Number(d.total) || 0
                const yy = y(val)
                const h = innerH - yy
                const label = val
                const mmdd = (d.date || '').slice(5)
                return (
                  <g key={d.date || i} transform={`translate(${x},0)`}>
                    <rect x={0} y={yy} width={barW} height={Math.max(0, h)} fill="var(--accent-end)" rx={2} />
                    {h > 12 && (
                      <text x={barW / 2} y={yy - 4} textAnchor="middle" fontSize="9" fill="#334155">{label}</text>
                    )}
                    {showLabel(i, d) && (
                      labelAngle === 0 ? (
                        <text x={barW / 2} y={innerH + 8} dominantBaseline="hanging" textAnchor="middle" fontSize="10" fill="#334155">{mmdd}</text>
                      ) : (
                        <text x={barW / 2} y={innerH + 8} dominantBaseline="hanging" textAnchor="middle" fontSize="10" fill="#334155" transform={`rotate(${labelAngle}, ${barW / 2}, ${innerH + 8})`}>{mmdd}</text>
                      )
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </div>
    )
  }

  // Daily TAT line chart with threshold
  const DailyTatLineChart = ({ rows = [], tatStandard = 48 }) => {
    const data = Array.isArray(rows) ? rows : []
    const n = data.length
    const values = []
    data.forEach(r => {
      if (r.avgTat != null) values.push(Number(r.avgTat))
      if (r.statAvgTat != null) values.push(Number(r.statAvgTat))
    })
    const maxY = Math.max(1, tatStandard || 0, ...values)
    const labelAngle = n <= 14 ? 0 : (n <= 31 ? 30 : (n <= 90 ? 40 : 45))
    const bottomLabelDepth = labelAngle === 0 ? 48 : (labelAngle === 30 ? 96 : (labelAngle === 40 ? 120 : 140))
    const margin = { top: 20, right: 20, bottom: bottomLabelDepth + 24, left: 44 }
    const innerH = 220
    const height = innerH + margin.top + margin.bottom
    // Dynamic step sizing
    const targetInnerW = 720
    const minStep = 6, maxStep = 40
    const step = Math.max(minStep, Math.min(maxStep, Math.floor(targetInnerW / Math.max(1, n))))
    const width = n * step + margin.left + margin.right
    const x = (i) => i * step + step / 2
    const y = (v) => {
      const n = Number(v) || 0
      if (n <= 0) return innerH
      const h = (n / maxY) * innerH
      return innerH - h
    }
    const makePath = (key) => {
      let dStr = ''
      let started = false
      data.forEach((r, i) => {
        const v = r[key]
        if (v == null) { started = false; return }
        const px = x(i)
        const py = y(v)
        if (!started) { dStr += `M ${px} ${py}`; started = true } else { dStr += ` L ${px} ${py}` }
      })
      return dStr
    }
    const ticks = 4
    const tickVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxY * i) / ticks))
    const showLabel = (i, d) => {
      if (n <= 30) return true
      if (n <= 90) return i % 7 === 0
      return String(d?.date || '').slice(8, 10) === '01'
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
          <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#10b981' }} /> <span>Avg TAT (h)</span></div>
          <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#6366f1' }} /> <span>STAT Avg TAT (h)</span></div>
          <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border border-dashed" style={{ background: 'transparent', borderColor: '#f59e0b' }} /> <span>Standard ({tatStandard}h)</span></div>
        </div>
        <div className="overflow-x-auto" style={{ overflowY: 'visible', paddingBottom: 24 }}>
          <svg width={width} height={height} role="img" aria-label="Daily TAT averages" style={{ overflow: 'visible', display: 'block' }}>
            <g transform={`translate(${margin.left},${margin.top})`}>
              {tickVals.map((tv, i) => (
                <g key={i}>
                  <line x1={0} x2={width - margin.left - margin.right} y1={y(tv)} y2={y(tv)} stroke="#e5e7eb" strokeWidth="1" />
                  <text x={-8} y={y(tv)} textAnchor="end" fontSize="10" fill="#64748b">{tv}</text>
                </g>
              ))}
              <line x1={0} x2={width - margin.left - margin.right} y1={y(tatStandard)} y2={y(tatStandard)} stroke="#f59e0b" strokeWidth="2" strokeDasharray="6,4" />
              <path d={makePath('avgTat')} fill="none" stroke="#10b981" strokeWidth="2" />
              <path d={makePath('statAvgTat')} fill="none" stroke="#6366f1" strokeWidth="2" />
              {data.map((r, i) => {
                const px = x(i)
                const mmdd = (r.date || '').slice(5)
                return (
                  <g key={r.date || i}>
                    {showLabel(i, r) && (
                      labelAngle === 0 ? (
                        <text x={px} y={innerH + 8} dominantBaseline="hanging" textAnchor="middle" fontSize="10" fill="#334155">{mmdd}</text>
                      ) : (
                        <text x={px} y={innerH + 8} dominantBaseline="hanging" textAnchor="middle" fontSize="10" fill="#334155" transform={`rotate(${labelAngle}, ${px}, ${innerH + 8})`}>{mmdd}</text>
                      )
                    )}
                    {n <= 120 && r.avgTat != null && <circle cx={px} cy={y(r.avgTat)} r="2.5" fill="#10b981" />}
                    {n <= 120 && r.statAvgTat != null && <circle cx={px} cy={y(r.statAvgTat)} r="2.5" fill="#6366f1" />}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </div>
    )
  }

  


  // KPI: load config
  const fetchKpiConfig = async () => {
    try {
      setKpiBusy(true)
      setKpiErr(null)
      const res = await fetch('/api/v1/kpi/config')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setKpiConfig(data.config)
    } catch (e) {
      setKpiErr(e.message)
      setKpiConfig(null)
    } finally {
      setKpiBusy(false)
    }
  }

  useEffect(() => { fetchKpiConfig() }, [])

  const shiftMonth = (delta) => {
    const cur = new Date(periodStart)
    const target = new Date(cur.getFullYear(), cur.getMonth() + delta, 1)
    setPeriodStart(fmtDate(firstOfMonth(target)))
    setPeriodEnd(fmtDate(lastOfMonth(target)))
  }

  // (legacy sample tests removed; use loadTestingMockData instead)

  // Load a small set of mock tests and productivity so KPIs compute without files
  const loadTestingMockData = () => {
    // Mock tests within the selected period
    const s = new Date(periodStart)
    const d1 = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 9)
    const d2 = new Date(s.getFullYear(), s.getMonth(), Math.min(s.getDate() + 1, 28), 10)
    const d3 = new Date(s.getFullYear(), s.getMonth(), Math.min(s.getDate() + 2, 28), 11)
    const tests = [
      { category: 'CYTO', received_at: d1.toISOString(), resulted_at: new Date(d1.getTime() + 8*3600*1000).toISOString() },
      { category: 'CYTO', received_at: d2.toISOString(), resulted_at: new Date(d2.getTime() + 6*3600*1000).toISOString() },
      { category: 'CYTO', received_at: d3.toISOString(), resulted_at: new Date(d3.getTime() + 10*3600*1000).toISOString() },
    ]
    setTestsJSON(JSON.stringify(tests, null, 2))

    // Helper to add days to an ISO date string
    const addDays = (iso, n) => {
      const base = new Date(iso)
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
      return d.toISOString().slice(0, 10)
    }

    // Mock productivity for 3 staff over a few days
    const prod = [
      { date: periodStart, staff_id: 'EMP-001', staff_name: 'Alex S.', hours_worked: 8, remote_hours: 2, in_lab_hours: 6 },
      { date: periodStart, staff_id: 'EMP-002', staff_name: 'Jordan P.', hours_worked: 7.5, remote_hours: 0, in_lab_hours: 7.5 },
      { date: periodStart, staff_id: 'EMP-003', staff_name: 'Taylor R.', hours_worked: 6, remote_hours: 1, in_lab_hours: 5 },
      { date: addDays(periodStart, 1), staff_id: 'EMP-001', staff_name: 'Alex S.', hours_worked: 8, remote_hours: 3, in_lab_hours: 5 },
      { date: addDays(periodStart, 1), staff_id: 'EMP-002', staff_name: 'Jordan P.', hours_worked: 8.5, remote_hours: 0, in_lab_hours: 8.5 },
      { date: addDays(periodStart, 2), staff_id: 'EMP-003', staff_name: 'Taylor R.', hours_worked: 7, remote_hours: 2, in_lab_hours: 5 },
    ]
    setUploadedProductivity(prod)
    setUploadedEmpSummary(aggregateEmployees(prod))
  }

  const hoursPerFteDay = useMemo(() => {
    const tpf = kpiConfig?.kpis?.tests_per_fte || {}
    return tpf.hours_per_fte_day || tpf.baseline_per_fte_per_day || 8
  }, [kpiConfig])

  // Removed quarter/year helpers since QTD/YTD UI is removed

  // (unused parseTestsSafe removed)

  // Removed QTD/YTD compute pipeline

  const computeKpi = async () => {
    try {
      setKpiBusy(true)
      setKpiErr(null)
      // parse tests JSON
      let tests = []
      try {
        const parsed = JSON.parse(testsJSON || '[]')
        if (!Array.isArray(parsed)) throw new Error('tests must be an array')
        tests = parsed
      } catch (e) {
        throw new Error(`Invalid tests JSON: ${e.message}`)
      }

      // Build payload using locally uploaded productivity when provided
      const payload = {
        period: { start_date: periodStart, end_date: periodEnd },
        tests,
        productivity: (uploadedProductivity && uploadedProductivity.length) ? uploadedProductivity : undefined,
      }
      const res = await fetch('/api/v1/kpi/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`HTTP ${res.status}: ${t}`)
      }
      const data = await res.json()
      setKpi(data)
    } catch (e) {
      setKpi(null)
      setKpiErr(e.message)
    } finally {
      setKpiBusy(false)
    }
  }

  // Removed FTE manual grouping adjustment; rely on config-derived tests_per_fte

  const exportCsv = () => {
    if (!kpi?.metrics) return
    const m = kpi.metrics
    const row = [
      kpi.meta?.period?.start_date || '',
      kpi.meta?.period?.end_date || '',
      m.cytogenetics_total_volume?.total ?? '',
      m.total_volume?.total ?? '',
      m.tat?.min_hours ?? '',
      m.tat?.avg_hours ?? '',
      m.tat?.max_hours ?? '',
      m.tat?.count ?? '',
      m.tat?.status ?? '',
      m.percent_change?.mom ?? '',
      m.percent_change?.yoy ?? '',
      m.tests_per_fte?.value ?? '',
      m.tests_per_fte?.total_hours ?? '',
      m.tests_per_fte?.fte_equivalents ?? '',
      m.tests_per_fte?.hours_per_fte_day ?? '',
    ]
    const headers = [
      'period_start','period_end','cyto_total','total_volume','tat_min_hours','tat_avg_hours','tat_max_hours','tat_count','tat_status','mom_percent','yoy_percent','tests_per_fte','total_hours','fte_equivalents','hours_per_fte_day'
    ]
    const csv = [headers.join(',') , row.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kpi_${periodStart}_${periodEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  // (removed: exportEmpCsv for Sheets-driven summaries)

  // Export locally uploaded summary
  const exportUploadedCsv = () => {
    if (!uploadedEmpSummary || uploadedEmpSummary.length === 0) return
    const headers = ['staff_id','staff_name','days_worked','total_hours','fte_equivalents','remote_hours','in_lab_hours','remote_pct']
    const rows = uploadedEmpSummary.map(e => [
      e.staff_id,
      (e.staff_name || '').replace(/,/g, ' '),
      e.days_worked ?? '',
      (e.total_hours ?? '').toFixed ? e.total_hours.toFixed(2) : (e.total_hours ?? ''),
      (e.fte_equivalents ?? '').toFixed ? e.fte_equivalents.toFixed(2) : (e.fte_equivalents ?? ''),
      (e.remote_hours ?? '').toFixed ? e.remote_hours.toFixed(2) : (e.remote_hours ?? ''),
      (e.in_lab_hours ?? '').toFixed ? e.in_lab_hours.toFixed(2) : (e.in_lab_hours ?? ''),
      e.remote_pct == null ? '' : `${e.remote_pct.toFixed(0)}%`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `uploaded_employees_${periodStart}_${periodEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // (removed: legacy simple CSV splitLine; using robust parseDelimitedText)

  // Normalize header aggressively: keep only a-z0-9 to make matching resilient to punctuation like ( ), /, :
  const normalizeHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')

  const parseDelimitedText = (text) => {
    const t = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Delimiter detection: count occurrences of tab, comma, semicolon in early sample
    const sample = t.slice(0, 4096)
    const counts = {
      tab: (sample.match(/\t/g) || []).length,
      comma: (sample.match(/,/g) || []).length,
      semi: (sample.match(/;/g) || []).length,
    }
    let delim = '\t'
    let max = counts.tab
    if (counts.comma > max) { delim = ','; max = counts.comma }
    if (counts.semi > max) { delim = ';'; max = counts.semi }
    // CSV/TSV parser that respects quotes and allows embedded newlines inside quoted fields
    const records = []
    let field = ''
    let row = []
    let inQuotes = false
    for (let i = 0; i < t.length; i++) {
      const ch = t[i]
      if (ch === '"') {
        if (inQuotes && t[i + 1] === '"') { field += '"'; i++ } else { inQuotes = !inQuotes }
      } else if (ch === delim && !inQuotes) {
        row.push(field); field = ''
      } else if (ch === '\n' && !inQuotes) {
        row.push(field); records.push(row); field = ''; row = []
      } else {
        field += ch
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); records.push(row) }
    const clean = (s) => String(s).replace(/^\"|\"$/g, '').trim()
    const cleaned = records.map(r => r.map(clean))
    if (!cleaned.length) return { headers: [], rows: [], delim }
    // Try to detect the header row within the first few lines (support both tests and productivity files)
    const headerCandidates = ['date','workdate','dateworked','receiveddate','collecteddate','resulteddate','signedoutdate','dos','servicedate','workday','day','worksheetdate','triage','case','analyzed','reviewed','date/time']
    let headerRowIndex = 0
    for (let i = 0; i < Math.min(10, cleaned.length); i++) {
      const norm = cleaned[i].map(normalizeHeader)
      const contains = headerCandidates.some(c => norm.includes(c) || norm.some(h => h.includes(c)))
      if (contains) { headerRowIndex = i; break }
    }
    const headers = (cleaned[headerRowIndex] || []).map(normalizeHeader)
    const rows = cleaned.slice(headerRowIndex + 1)
    return { headers, rows, delim }
  }

  const indexOfHeader = (headers, variants) => {
    for (const v of variants) {
      const key = v.toLowerCase().replace(/\s+/g, '').replace(/[_-]/g, '')
      const idx = headers.indexOf(key)
      if (idx !== -1) return idx
    }
    return -1
  }

  // Find first header index that contains any of the provided tokens (normalized)
  const findIdxContains = (headers, tokens) => {
    const norms = (tokens || []).map(t => normalizeHeader(t))
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]
      if (!h) continue
      for (const t of norms) {
        if (h.includes(t)) return i
      }
    }
    return -1
  }

  // Helpers to detect and normalize dates from various sources (JS Date, Excel serials, strings)
  const isDateLike = (v) => {
    if (v == null || v === '') return false
    if (v instanceof Date && !isNaN(v.getTime())) return true
    if (typeof v === 'number') {
      // Likely Excel serial if within plausible range (Excel serial 25569 ~ 1970-01-01)
      if (v > 20000 && v < 60000) return true
    }
    if (typeof v === 'string') {
      const s = v.trim()
      if (!s) return false
      if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return true
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) return true
      if (/^\d{8}$/.test(s)) return true // yyyymmdd
      if (/[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}/.test(s)) return true
    }
    return false
  }

  const toISODateOnly = (v) => {
    try {
      if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
      if (typeof v === 'number') {
        // Convert Excel serial to JS Date (using 1899-12-30 epoch to account for Excel leap year bug)
        const epoch = Date.UTC(1899, 11, 30)
        const ms = epoch + v * 86400000
        const d = new Date(ms)
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
      }
      if (typeof v === 'string') {
        const s = v.trim()
        if (!s) return ''
        if (/^\d{8}$/.test(s)) {
          const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8)
          return `${y}-${m}-${d}`
        }
        const d = new Date(s)
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
      }
    } catch (_) {}
    return ''
  }

  // Normalize various date-time inputs (Excel serials, strings) to ISO datetime (UTC)
  const toISODatetime = (v) => {
    try {
      if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString()
      if (typeof v === 'number') {
        const epoch = Date.UTC(1899, 11, 30)
        const ms = epoch + v * 86400000
        const d = new Date(ms)
        if (!isNaN(d.getTime())) return d.toISOString()
      }
      if (typeof v === 'string') {
        const s = v.trim()
        if (!s) return ''
        // Handle yyyymmddhhmm or yyyymmdd
        if (/^\d{8}$/.test(s)) {
          const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8)
          const dt = new Date(`${y}-${m}-${d}T00:00:00Z`)
          if (!isNaN(dt.getTime())) return dt.toISOString()
        }
        const d = new Date(s)
        if (!isNaN(d.getTime())) return d.toISOString()
      }
    } catch (_) {}
    return ''
  }

  // Convert TAT column values to hours. The uploaded file's TAT (col AC) is already in HOURS
  // as a decimal (e.g., 2.2 hours). Also supports "H:MM" strings.
  const parseTatToHours = (v) => {
    if (v == null || v === '') return null
    if (typeof v === 'number') {
      const hours = v
      if (!Number.isFinite(hours)) return null
      if (hours <= 0) return null
      return hours
    }
    const s = String(v).trim()
    if (!s) return null
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const [hh, mm] = s.split(':').map(x => parseInt(x, 10) || 0)
      return hh + (mm / 60)
    }
    const n = Number(s.replace(/,/g, ''))
    if (!Number.isNaN(n)) return n > 0 ? n : null
    return null
  }

  // Normalize case number for deduplication
  const normalizeCaseNo = (v) => {
    const s = (v == null ? '' : String(v)).trim()
    return s ? s.toUpperCase() : ''
  }

  // Extract technician names from "Analyzed by" cells.
  // Supports multiple names separated by '/', ';', '&', or the word 'and'.
  const extractTechNames = (v) => {
    const raw = String(v == null ? '' : v).trim()
    if (!raw) return []
    const parts = raw
      .split(/[/;&]|\band\b/i)
      .map((s) => s.trim())
      .filter(Boolean)
    // Dedupe while preserving order
    const seen = new Set()
    const out = []
    for (const p of parts) {
      const key = p.replace(/\s+/g, ' ').toLowerCase()
      if (!seen.has(key)) { seen.add(key); out.push(p) }
    }
    return out
  }

  // Heuristic filter to exclude non-person tokens (e.g., 'Tech', 'Tech Abnormal Ratio')
  const normalizeToken = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
  const STOP_NAME_TOKENS = new Set([
    'tech','technician','technologist','review','reviewer','reviewedby',
    'qc','doqc','qualitycontrol','abnormalratio','ratio','tat','case','cases',
    'month','total','sum','number','stat','averagetat','tatforstatcases',
    'numberoffailures','numberofstatcases','karyotype','karyotyping','volume'
  ])
  const isLikelyPersonName = (s) => {
    const n = normalizeToken(s)
    if (!n) return false
    if (STOP_NAME_TOKENS.has(n)) return false
    if (n.includes('ratio') || n.includes('tat') || n.includes('case') || n.includes('abnormal') || n.includes('total') || n.includes('number') || n.includes('stat')) return false
    // Exclude single-letter tokens
    if (n.length === 1) return false
    // Permit common patterns: initials with dot, names with spaces/hyphens
    return true
  }

  const guessDateIdx = (headers, rows) => {
    const cols = Math.max(0, ...rows.map(r => (r || []).length))
    if (!cols) return -1
    const scores = new Array(cols).fill(0)
    const sampleCount = Math.min(rows.length, 50)
    for (let i = 0; i < sampleCount; i++) {
      const r = rows[i] || []
      for (let c = 0; c < cols; c++) {
        if (isDateLike(r[c])) scores[c]++
      }
    }
    let bestIdx = -1, bestScore = 0
    for (let c = 0; c < cols; c++) {
      if (scores[c] > bestScore) { bestScore = scores[c]; bestIdx = c }
    }
    const ratio = sampleCount ? (bestScore / sampleCount) : 0
    return (bestIdx !== -1 && ratio >= 0.3) ? bestIdx : -1
  }

  const aggregateEmployees = (items) => {
    const byStaff = new Map()
    for (const it of items) {
      const sid = String(it.staff_id || 'UNKNOWN')
      const name = it.staff_name || ''
      const hours = Number(it.hours_worked ?? it.total_hours ?? 0) || 0
      const remote = Number(it.remote_hours || 0) || 0
      const inLab = Number(it.in_lab_hours || 0) || 0
      if (!byStaff.has(sid)) byStaff.set(sid, { staff_id: sid, staff_name: name, total_hours: 0, remote_hours: 0, in_lab_hours: 0, dates: new Set() })
      const agg = byStaff.get(sid)
      agg.total_hours += hours
      agg.remote_hours += remote
      agg.in_lab_hours += inLab
      if (it.date) agg.dates.add(it.date)
    }
    const list = Array.from(byStaff.values()).map(x => ({
      ...x,
      days_worked: x.dates.size,
      fte_equivalents: hoursPerFteDay ? (x.total_hours / hoursPerFteDay) : null,
      remote_pct: (x.total_hours > 0) ? (x.remote_hours * 100 / x.total_hours) : null,
    }))
    list.sort((a,b) => (b.total_hours||0) - (a.total_hours||0))
    return list
  }

  // (legacy per-type upload click handlers removed)
  
  // Unified upload (tests or productivity) via a single "+" button
  const handleUnifiedUploadClick = () => {
    setUploadErr(null)
    if (unifiedFileRef.current) unifiedFileRef.current.click()
  }

  const handleUnifiedFileSelected = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    try {
      setUploadBusy(true)
      setUploadErr(null)

      const name = (file.name || '').toLowerCase()
      let headers = []
      let rows = []

      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const ab = await file.arrayBuffer()
        const wb = XLSX.read(ab, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const a2d = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
        if (!a2d.length) throw new Error('Empty or invalid file')
        // Try to detect the header row within the first few lines (supports both tests and productivity files)
        let headerRowIndex = 0
        const headerCandidates = ['date','workdate','dateworked','receiveddate','collecteddate','resulteddate','signedoutdate','dos','servicedate','workday','day','worksheetdate','triage','case','analyzed','reviewed','date/time']
        for (let i = 0; i < Math.min(10, a2d.length); i++) {
          const row = a2d[i] || []
          const norm = row.map(normalizeHeader)
          const contains = headerCandidates.some(c => norm.includes(normalizeHeader(c)) || norm.some(h => h.includes(normalizeHeader(c))))
          if (contains) { headerRowIndex = i; break }
        }
        headers = (a2d[headerRowIndex] || []).map(normalizeHeader)
        rows = a2d.slice(headerRowIndex + 1)
        // Respect hard cap before any filtering/mapping
        rows = rows.slice(0, MAX_DATA_ROWS)
        // Remove completely blank rows
        rows = rows.filter(r => (r || []).some(c => String(c || '').trim() !== ''))
      } else {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('Failed to read file'))
          reader.readAsText(file)
        })
        const parsed = parseDelimitedText(text)
        headers = parsed.headers
        rows = parsed.rows
        // Respect hard cap before any filtering/mapping
        rows = rows.slice(0, MAX_DATA_ROWS)
        // Remove completely blank rows
        rows = rows.filter(r => (r || []).some(c => String(c || '').trim() !== ''))
      }

      if (!headers.length || !rows.length) throw new Error('Empty or invalid file')

      // Heuristic: does this look like a tests export?
      const idxTriage = findIdxContains(headers, ['triage date/time (job creation)', 'triage', 'job creation', 'date/time', 'datetime'])
      const idxOneCase = findIdxContains(headers, ['1-case', '1case'])
      const idxOneCaseDt = idxOneCase !== -1 ? idxOneCase + 1 : -1
      const idxReviewedBy = findIdxContains(headers, ['reviewed by', 'reviewedby'])
      const idxReviewedDt = idxReviewedBy !== -1 ? idxReviewedBy + 1 : -1
      const idxAnalyzedBy = findIdxContains(headers, ['analyzed by', 'analyzedby'])
      const idxAnalyzedDt = idxAnalyzedBy !== -1 ? idxAnalyzedBy + 1 : -1
      // Loose match for analyzed-by column (e.g., "Analyzed By:") on normalized headers
      const idxAnalyzedLoose = headers.findIndex(h => (h || '').includes('analy'))
      const idxAnalyzedAny = (idxAnalyzedBy !== -1) ? idxAnalyzedBy : idxAnalyzedLoose
      // QC performer column (e.g., "Do QC", "QC By", "Quality Control")
      let idxQCBy = findIdxContains(headers, ['do qc','qc by','quality control','doqc','qcby','qualitycontrol','qc'])
      // Also consider core Karyotyping columns as a strong signal of tests export
      const hasCaseNoHdr = indexOfHeader(headers, ['case','case#','caseno','case number','casenumber','caseid']) !== -1
      const hasAbnNormHdr = indexOfHeader(headers, ['abn/norm','abnnorm','abn_norm']) !== -1
      const hasTatHdr = indexOfHeader(headers, ['tat']) !== -1

      const looksLikeTests = (idxTriage !== -1) || (idxOneCaseDt !== -1) || (idxReviewedDt !== -1) || (idxAnalyzedDt !== -1) || (idxAnalyzedAny !== -1) || hasCaseNoHdr || hasAbnNormHdr || hasTatHdr

      let handled = false

      if (looksLikeTests) {
        // Map additional columns for case number, Abn/Norm flag, and TAT
        let idxCaseNo = indexOfHeader(headers, ['case','case#','caseno','case number','casenumber','caseid'])
        if (idxCaseNo === -1) idxCaseNo = findIdxContains(headers, ['case','case#','caseno','casenumber','caseid'])
        let idxAbnNorm = indexOfHeader(headers, ['abn/norm','abnnorm','abn_norm'])
        let idxTat = indexOfHeader(headers, ['tat'])
        // Priority column (medical stat if value === 0)
        let idxPriority = indexOfHeader(headers, ['prty','priority','prio'])
        // Column A Date (worksheet/date header). We will forward-fill blanks until the next date.
        let idxWorkDate = indexOfHeader(headers, ['worksheetdate','workdate','date','workday','day','worksheet date'])

        const tests = []
        let lastWorkISO = ''
        for (const arr of rows) {
          const flagOneCase = idxOneCase !== -1 ? String(arr[idxOneCase] || '').toLowerCase() : ''
          const endRaw = (idxReviewedDt !== -1 ? arr[idxReviewedDt]
                          : (idxOneCaseDt !== -1 ? arr[idxOneCaseDt]
                          : (idxAnalyzedDt !== -1 ? arr[idxAnalyzedDt] : '')))
          const startRaw = (idxTriage !== -1 ? arr[idxTriage]
                          : (idxAnalyzedDt !== -1 ? arr[idxAnalyzedDt] : ''))
          const ended = toISODatetime(endRaw)
          const started = toISODatetime(startRaw)
          if (!ended && flagOneCase && ['false', '0', 'no'].includes(flagOneCase)) continue

          const caseNo = idxCaseNo !== -1 ? normalizeCaseNo(arr[idxCaseNo]) : ''
          const abnRaw = idxAbnNorm !== -1 ? String(arr[idxAbnNorm] || '').trim().toUpperCase() : ''
          const abnFlag = abnRaw ? abnRaw.charAt(0) : '' // Expect 'A', 'F', 'N', 'L', etc.
          const tatRaw = idxTat !== -1 ? arr[idxTat] : null
          const tatHours = parseTatToHours(tatRaw)
          // Priority parsing (treat exact numeric 0 as STAT)
          let priorityVal = undefined
          if (idxPriority !== -1) {
            const raw = arr[idxPriority]
            const s = String(raw ?? '').trim()
            if (s !== '') {
              const n = Number(s.replace(/[^0-9.\-]/g, ''))
              if (!Number.isNaN(n)) priorityVal = n
            }
          }

          // Determine worksheet work date from Column A (or similar). Forward-fill blanks.
          let workISO = ''
          if (idxWorkDate !== -1) {
            workISO = toISODateOnly(arr[idxWorkDate]) || ''
            if (!workISO && lastWorkISO) workISO = lastWorkISO
            if (workISO) lastWorkISO = workISO
          }

          // Extract technician names from the "Analyzed by" column (strict or loose index)
          const analyzedByRaw = idxAnalyzedAny !== -1 ? String(arr[idxAnalyzedAny] || '').trim() : ''
          const analyzedTechs = analyzedByRaw ? extractTechNames(analyzedByRaw) : []

          // Extract reviewer and QC names (column P/R typical). Header-based first, with positional fallback.
          let reviewedByRaw = idxReviewedBy !== -1 ? String(arr[idxReviewedBy] || '').trim() : ''
          let qcByRaw = idxQCBy !== -1 ? String(arr[idxQCBy] || '').trim() : ''
          // Fallback to typical positions if headers not detected (P=16th -> index 15, R=18th -> index 17)
          if (!reviewedByRaw && Array.isArray(arr) && arr.length >= 16) {
            reviewedByRaw = String(arr[15] || '').trim()
          }
          if (!qcByRaw && Array.isArray(arr) && arr.length >= 18) {
            qcByRaw = String(arr[17] || '').trim()
          }
          const reviewers = reviewedByRaw ? extractTechNames(reviewedByRaw).filter(isLikelyPersonName) : []
          const qcPeople = qcByRaw ? extractTechNames(qcByRaw).filter(isLikelyPersonName) : []

          tests.push({
            category: 'CYTO',
            case_no: caseNo || undefined,
            abn_norm: abnFlag || undefined,
            tat_hours: tatHours != null ? tatHours : undefined,
            received_at: started || undefined,
            resulted_at: ended || undefined,
            work_date: workISO || undefined,
            analyzed_by: analyzedByRaw || undefined,
            analyzed_techs: analyzedTechs.length ? analyzedTechs : undefined,
            reviewed_by: reviewedByRaw || undefined,
            reviewers: reviewers.length ? reviewers : undefined,
            qc_by: qcByRaw || undefined,
            qc_people: qcPeople.length ? qcPeople : undefined,
            priority: priorityVal,
          })
        }
        if (tests.length) { setTestsJSON(JSON.stringify(tests, null, 2)); handled = true }
      }

      if (!handled) {
        // Treat as productivity
        let idxDate = indexOfHeader(headers, ['date','workdate','dateworked','workday','day','receiveddate','collecteddate','resulteddate','signedoutdate','dos','servicedate','worksheetdate'])
        let idxStaffId = indexOfHeader(headers, ['staff_id','staffid','employeeid','id'])
        let idxStaffName = indexOfHeader(headers, ['staff_name','name','employee','employee_name'])
        if (idxStaffId === -1) idxStaffId = findIdxContains(headers, ['staffid','employeeid','empid','badgeid','userid'])
        if (idxStaffName === -1) idxStaffName = findIdxContains(headers, ['staffname','staff','employee','employeename','fullname','name','tech','technologist','initials','operator','user'])
        let idxRemote = indexOfHeader(headers, ['remote_hours','remote'])
        if (idxRemote === -1) idxRemote = findIdxContains(headers, ['remotehours','remotehrs','remoteh','remote'])
        let idxInLab = indexOfHeader(headers, ['in_lab_hours','inlab','labhours'])
        if (idxInLab === -1) idxInLab = findIdxContains(headers, ['inlabhours','inlab','onsitehours','onsite','labhours','inlabhours'])
        let idxHours = indexOfHeader(headers, ['hours_worked','hours','totalhours'])
        if (idxHours === -1) idxHours = findIdxContains(headers, ['hoursworked','totalhours','workedhours','hrs','hr','duration','timeworked','worktime','totaltime','totalh','workedtime'])
        if (idxHours !== -1 && (idxHours === idxRemote || idxHours === idxInLab)) idxHours = -1
        if (idxHours === -1) {
          for (let i = 0; i < headers.length; i++) {
            const h = headers[i] || ''
            if (!h) continue
            const isHours = h.includes('hour') || h.endsWith('hrs') || h.endsWith('hr') || h.includes('duration') || h.includes('time')
            const isRemote = h.includes('remote')
            const isInLab = h.includes('inlab') || h.includes('onsite') || h.includes('lab')
            if (isHours && !isRemote && !isInLab) { idxHours = i; break }
          }
        }
        if (idxDate === -1) idxDate = guessDateIdx(headers, rows)
        if (idxDate === -1) {
          const available = headers.filter(Boolean).join(', ') || '(none)'
          throw new Error(`Missing required "date" column. Available headers: ${available}`)
        }

        const itemsRaw = []
        let lastISODate = ''
        for (const arr of rows) {
          let iso = toISODateOnly(arr[idxDate]) || ''
          if (!iso && lastISODate) iso = lastISODate
          if (iso) lastISODate = iso
          itemsRaw.push({
            date: iso,
            staff_id: idxStaffId !== -1 ? String(arr[idxStaffId] || '') : '',
            staff_name: idxStaffName !== -1 ? String(arr[idxStaffName] || '') : '',
            remote_hours: idxRemote !== -1 ? arr[idxRemote] : '',
            in_lab_hours: idxInLab !== -1 ? arr[idxInLab] : '',
            hours_worked: idxHours !== -1 ? arr[idxHours] : '',
          })
        }

        const toNum = (v) => {
          if (v == null || v === '') return undefined
          if (typeof v === 'number') return Number.isNaN(v) ? undefined : v
          const raw = String(v).trim()
          if (!raw) return undefined
          const s = raw.toLowerCase()
          const hm = s.match(/^\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*$/)
          if (hm) {
            const h = parseInt(hm[1], 10) || 0
            const m = parseInt(hm[2], 10) || 0
            const sec = hm[3] ? (parseInt(hm[3], 10) || 0) : 0
            return h + (m / 60) + (sec / 3600)
          }
          const hOnly = s.match(/^(\d+(?:[\.,]\d+)?)\s*h(?:ours?|rs?)?$/)
          if (hOnly) return Number(hOnly[1].replace(/,/g, '.'))
          const mOnly = s.match(/^(\d+)\s*m(?:in(?:utes?)?)?$/)
          if (mOnly) return (parseInt(mOnly[1], 10) || 0) / 60
          const hAndM = s.match(/^(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*m(?:in(?:utes?)?)?$/)
          if (hAndM) return (parseInt(hAndM[1], 10) || 0) + (parseInt(hAndM[2], 10) || 0) / 60
          const hWithMin = s.match(/^(\d+)h(\d{1,2})$/)
          if (hWithMin) return (parseInt(hWithMin[1], 10) || 0) + (parseInt(hWithMin[2], 10) || 0) / 60
          const num = Number(s.replace(/,/g, '').replace(/\s*(h|hr|hrs|hour|hours)\b/, ''))
          return Number.isNaN(num) ? undefined : num
        }

        const normalizeRow = (r) => {
          const remote = toNum(r.remote_hours) || 0
          const inLab = toNum(r.in_lab_hours) || 0
          let hours = toNum(r.hours_worked)
          let total = toNum(r.total_hours)
          if (total == null && (remote || inLab)) total = remote + inLab
          if (hours == null && total != null) hours = total
          const sid = r.staff_id && String(r.staff_id).trim() ? String(r.staff_id).trim() : (r.staff_name && String(r.staff_name).trim() ? String(r.staff_name).trim() : '')
          return {
            date: r.date,
            staff_id: sid,
            staff_name: r.staff_name,
            hours_worked: hours,
            remote_hours: toNum(r.remote_hours),
            in_lab_hours: toNum(r.in_lab_hours),
            total_hours: total,
          }
        }

        // Filter by selected period
        const s = new Date(periodStart)
        const eDate = new Date(periodEnd)
        const eDay = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate(), 23,59,59)
        const inRange = itemsRaw.filter(r => {
          try { const d = new Date(r.date); return d >= s && d <= eDay } catch { return false }
        })
        const normalized = inRange.map(normalizeRow)
        setUploadedProductivity(normalized)
        const list = aggregateEmployees(normalized)
        setUploadedEmpSummary(list)
        handled = true
      }

      if (!handled) throw new Error('Could not detect file type or no usable records found')
    } catch (err) {
      setUploadedProductivity([])
      setUploadedEmpSummary([])
      setUploadErr(err.message || String(err))
    } finally {
      setUploadBusy(false)
      if (e.target) e.target.value = ''
    }
  }
  // (legacy per-type file handlers removed)

  useEffect(() => { checkHealth() }, [])

  // Auto-compute KPIs on key input changes (period or uploaded productivity)
  useEffect(() => {
    computeKpi()
    // Intentionally not adding computeKpi to deps to avoid ref changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStart, periodEnd, uploadedProductivity])

  // Debounce recompute when the tests JSON changes (e.g., Load Sample or manual edits)
  useEffect(() => {
    const t = setTimeout(() => { computeKpi() }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testsJSON])

  // (removed: Sheets productivity tester functions)

  // Parsed tests array used also for monthly dashboard table
  const testsArray = useMemo(() => {
    try {
      const parsed = JSON.parse(testsJSON || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [testsJSON])

  // TAT standard hours used for "% over standard" column (falls back to warning threshold or 48h)
  const tatStandardHours = useMemo(() => {
    const th = kpiConfig?.kpis?.tat?.thresholds || {}
    return (th.standard ?? th.warning ?? 48)
  }, [kpiConfig])

  const monthNames = [
    'January','February','March','April','May','June','July','August','September','October','November','December'
  ]

  // Parse year from ISO date string (YYYY-MM-DD) without constructing a Date (avoids timezone rollbacks)
  const getYearFromISO = (s) => {
    const str = String(s || '')
    const m = str.match(/^\s*(\d{4})-/)
    return m ? (parseInt(m[1], 10) || new Date().getFullYear()) : new Date().getFullYear()
  }

  // Visualization year (KPI charts) decoupled from global period; initialized from periodStart once
  const [vizYear, setVizYear] = useState(() => getYearFromISO(periodStart))

  // Year nav for KPI visualizations (does not mutate global period)
  const shiftVizYear = useCallback((delta) => {
    setVizYear((prev) => prev + delta)
  }, [])

  // Date range state for on-demand visualizations
  const [rangeStart, setRangeStart] = useState(periodStart)
  const [rangeEnd, setRangeEnd] = useState(periodEnd)

  // Helpers to enumerate dates safely (avoid UTC rollbacks by formatting from local parts)
  const pad2 = (n) => String(n).padStart(2, '0')
  const dateToISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const enumerateDates = useCallback((startISO, endISO) => {
    const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
    if (!ok(startISO) || !ok(endISO)) return []
    const ys = parseInt(startISO.slice(0, 4), 10), ms = parseInt(startISO.slice(5, 7), 10) - 1, ds = parseInt(startISO.slice(8, 10), 10)
    const ye = parseInt(endISO.slice(0, 4), 10), me = parseInt(endISO.slice(5, 7), 10) - 1, de = parseInt(endISO.slice(8, 10), 10)
    const start = new Date(ys, ms, ds)
    const end = new Date(ye, me, de)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return []
    const out = []
    const cur = new Date(start.getTime())
    while (cur <= end) {
      out.push(dateToISO(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }, [])

  // Reset the custom date range to the current calendar month
  const resetRangeToCurrentMonth = useCallback(() => {
    const now = new Date()
    setRangeStart(fmtDate(firstOfMonth(now)))
    setRangeEnd(fmtDate(lastOfMonth(now)))
  }, [])

  // Helpers to classify records
  const isCyto = useCallback((t) => {
    const c = String(t.type || t.category || '').trim().toUpperCase()
    return c === 'CYTO' || c === 'CYTOGENETICS' || c === 'KARYOTYPE' || c === 'KARYOTYPING'
  }, [])

  const detectFlags = useCallback((t) => {
    const s = (v) => (v == null ? '' : String(v)).toLowerCase()
    const bag = [s(t.result), s(t.final_result), s(t.interpretation), s(t.comment), s(t.flag), s(t.result_flag), s(t.status), s(t.outcome), s(t.notes)]
    const text = bag.join(' ')
    const abnormal = /\babnormal\b/.test(text) || t.abnormal === true || s(t.abnormal) === 'true'
    const hasPositive = /(^|\b)positive(\b|$)/.test(text)
    const hasNegative = /(^|\b)negative(\b|$)/.test(text)
    const positive = (t.positive === true) || (hasPositive && !hasNegative)
    const negative = (t.negative === true) || (hasNegative && !hasPositive)
    const failure = /(fail|cancel|cancell|no\s*growth|\bqns\b|unsat|inadequate)/.test(text) || t.failed === true
    const stat = t.stat === true || /\bstat\b/.test(text) || /stat/.test(s(t.priority)) || /stat/.test(s(t.order_priority))
    return { abnormal, positive, negative, failure, stat }
  }, [])

  const getTimestamp = useCallback((t) => {
    // Prefer worksheet/work_date (Column A) if present; forward-filled during parsing
    const workIso = toISODateOnly(t.work_date ?? t.worksheet_date ?? t.workdate ?? t.date)
    if (workIso) {
      // Construct a local-time date to avoid UTC timezone roll-back into previous day/month
      // e.g., 2025-08-01T00:00:00Z in UTC-4 becomes Jul 31 locally. Using local constructor avoids that.
      const parts = workIso.split('-').map((x) => parseInt(x, 10))
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const d = new Date(parts[0], parts[1] - 1, parts[2])
        return isNaN(d.getTime()) ? null : d
      }
    }
    const iso = toISODatetime(t.resulted_at ?? t.signed_out_at ?? t.received_at ?? t.collected_at)
    if (!iso) return null
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d
  }, [])

  const getTatHours = useCallback((t) => {
    const endIso = toISODatetime(t.resulted_at ?? t.signed_out_at)
    const startIso = toISODatetime(t.received_at ?? t.collected_at)
    if (!endIso || !startIso) return null
    try {
      const end = new Date(endIso)
      const start = new Date(startIso)
      if (isNaN(end.getTime()) || isNaN(start.getTime()) || end < start) return null
      return (end - start) / 3600000
    } catch { return null }
  }, [])

  const monthlyTable = useMemo(() => {
    const year = getYearFromISO(periodStart)

    // Unique case aggregation (for counts/abnormal/fail) and raw row lists (for TAT averages)
    const thisYearCases = Array.from({ length: 12 }, () => new Map()) // month -> Map(caseNo -> agg)
    const prevYearCases = Array.from({ length: 12 }, () => new Map())
    const thisYearRows = Array.from({ length: 12 }, () => []) // month -> rows (tests)

    for (const t of testsArray) {
      if (!isCyto(t)) continue
      // Derive year/month strictly from worksheet work_date string to avoid any fallback drift (e.g., into July)
      const wd = t.work_date ?? t.worksheet_date ?? t.workdate ?? t.date
      if (!(typeof wd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wd))) continue
      const y = parseInt(wd.slice(0, 4), 10)
      const m = parseInt(wd.slice(5, 7), 10) - 1
      const caseKey = normalizeCaseNo(t.case_no || t.case || t.case_number || '')
      if (y === year) {
        // rows for TAT average
        thisYearRows[m].push(t)
        if (caseKey) {
          const bucket = thisYearCases[m]
          if (!bucket.has(caseKey)) bucket.set(caseKey, { abn: false, fail: false, stat: false, prio0: false, tatSum: 0, tatN: 0 })
          const agg = bucket.get(caseKey)
          const abnRaw = (t.abn_norm == null ? '' : String(t.abn_norm)).trim().toUpperCase()
          if (abnRaw.startsWith('A')) agg.abn = true
          if (abnRaw.startsWith('F')) agg.fail = true
          const flags = detectFlags(t)
          if (flags.stat) agg.stat = true
          // Medical STAT via Priority column (0)
          if (t.priority != null && Number(t.priority) === 0) agg.prio0 = true
          // Accumulate TAT per case for later case-level averaging
          const th_case = (t.tat_hours != null && Number.isFinite(Number(t.tat_hours)) && Number(t.tat_hours) > 0) ? Number(t.tat_hours) : null
          if (th_case != null) { agg.tatSum += th_case; agg.tatN += 1 }
        }
      } else if (y === year - 1) {
        if (caseKey) {
          const bucket = prevYearCases[m]
          if (!bucket.has(caseKey)) bucket.set(caseKey, { })
        }
      }
    }

    const thisYearCounts = thisYearCases.map(map => map.size)
    const prevYearCounts = prevYearCases.map(map => map.size)
    const decPrevYearCount = prevYearCounts[11]

    const rows = []
    for (let m = 0; m < 12; m++) {
      const monthCases = thisYearCases[m]
      const monthRows = thisYearRows[m]
      const total = monthCases.size
      const prevYearCount = prevYearCounts[m] || 0
      const prevMonthCount = m === 0 ? decPrevYearCount : thisYearCounts[m - 1]

      // Counts for abnormal/failure/stat at the case level
      let abnormalCount = 0, failureCount = 0, statCount = 0
      let tatStatSum = 0, tatStatN = 0
      for (const [, info] of monthCases) {
        if (info.abn) abnormalCount++
        if (info.fail) failureCount++
        if (info.prio0) {
          statCount++
          if (info.tatN > 0) {
            tatStatSum += (info.tatSum / info.tatN)
            tatStatN++
          }
        }
      }

      // Standard average of the TAT column (AC) over non-null, positive entries at the row level
      let tatSum = 0, tatN = 0, tatOverStd = 0
      for (const t of monthRows) {
        const th = (t.tat_hours != null && Number.isFinite(Number(t.tat_hours)) && Number(t.tat_hours) > 0) ? Number(t.tat_hours) : null
        if (th != null) {
          tatSum += th; tatN++
          if (tatStandardHours != null && th > tatStandardHours) tatOverStd++
          // STAT average handled at case level (priority === 0)
        }
      }

      const yoy = prevYearCount > 0 ? ((total - prevYearCount) * 100.0 / prevYearCount) : null
      const mom = prevMonthCount > 0 ? ((total - prevMonthCount) * 100.0 / prevMonthCount) : null

      rows.push({
        monthIndex: m,
        monthName: monthNames[m],
        total,
        yoy,
        mom,
        abnormalCases: abnormalCount,
        percentAbnormal: total > 0 ? (abnormalCount * 100.0 / total) : null,
        percentPositive: null,
        percentNegative: null,
        failures: failureCount,
        statCases: statCount,
        avgTat: tatN ? (tatSum / tatN) : null,
        statAvgTat: tatStatN ? (tatStatSum / tatStatN) : null,
        tatOverStdPct: tatN ? (tatOverStd * 100.0 / tatN) : null,
      })
    }
    return rows
  }, [testsArray, periodStart, detectFlags, getTimestamp, tatStandardHours, isCyto])

  // Monthly aggregation for KPI visualizations (driven by vizYear, independent from global period)
  const monthlyVizTable = useMemo(() => {
    const year = vizYear

    const thisYearCases = Array.from({ length: 12 }, () => new Map())
    const prevYearCases = Array.from({ length: 12 }, () => new Map())
    const thisYearRows = Array.from({ length: 12 }, () => [])

    for (const t of testsArray) {
      if (!isCyto(t)) continue
      const wd = t.work_date ?? t.worksheet_date ?? t.workdate ?? t.date
      if (!(typeof wd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wd))) continue
      const y = parseInt(wd.slice(0, 4), 10)
      const m = parseInt(wd.slice(5, 7), 10) - 1
      const caseKey = normalizeCaseNo(t.case_no || t.case || t.case_number || '')
      if (y === year) {
        thisYearRows[m].push(t)
        if (caseKey) {
          const bucket = thisYearCases[m]
          if (!bucket.has(caseKey)) bucket.set(caseKey, { abn: false, fail: false, stat: false, prio0: false, tatSum: 0, tatN: 0 })
          const agg = bucket.get(caseKey)
          const abnRaw = (t.abn_norm == null ? '' : String(t.abn_norm)).trim().toUpperCase()
          if (abnRaw.startsWith('A')) agg.abn = true
          if (abnRaw.startsWith('F')) agg.fail = true
          const flags = detectFlags(t)
          if (flags.stat) agg.stat = true
          if (t.priority != null && Number(t.priority) === 0) agg.prio0 = true
          const th_case = (t.tat_hours != null && Number.isFinite(Number(t.tat_hours)) && Number(t.tat_hours) > 0) ? Number(t.tat_hours) : null
          if (th_case != null) { agg.tatSum += th_case; agg.tatN += 1 }
        }
      } else if (y === year - 1) {
        if (caseKey) {
          const bucket = prevYearCases[m]
          if (!bucket.has(caseKey)) bucket.set(caseKey, { })
        }
      }
    }

    const thisYearCounts = thisYearCases.map(map => map.size)
    const prevYearCounts = prevYearCases.map(map => map.size)
    const decPrevYearCount = prevYearCounts[11]

    const rows = []
    for (let m = 0; m < 12; m++) {
      const monthCases = thisYearCases[m]
      const monthRows = thisYearRows[m]
      const total = monthCases.size
      const prevYearCount = prevYearCounts[m] || 0
      const prevMonthCount = m === 0 ? decPrevYearCount : thisYearCounts[m - 1]

      let abnormalCount = 0, failureCount = 0, statCount = 0
      let tatStatSum = 0, tatStatN = 0
      for (const [, info] of monthCases) {
        if (info.abn) abnormalCount++
        if (info.fail) failureCount++
        if (info.prio0) {
          statCount++
          if (info.tatN > 0) {
            tatStatSum += (info.tatSum / info.tatN)
            tatStatN++
          }
        }
      }

      let tatSum = 0, tatN = 0, tatOverStd = 0
      for (const t of monthRows) {
        const th = (t.tat_hours != null && Number.isFinite(Number(t.tat_hours)) && Number(t.tat_hours) > 0) ? Number(t.tat_hours) : null
        if (th != null) {
          tatSum += th; tatN++
          if (tatStandardHours != null && th > tatStandardHours) tatOverStd++
        }
      }

      const yoy = prevYearCount > 0 ? ((total - prevYearCount) * 100.0 / prevYearCount) : null
      const mom = prevMonthCount > 0 ? ((total - prevMonthCount) * 100.0 / prevMonthCount) : null

      rows.push({
        monthIndex: m,
        monthName: monthNames[m],
        total,
        yoy,
        mom,
        abnormalCases: abnormalCount,
        percentAbnormal: total > 0 ? (abnormalCount * 100.0 / total) : null,
        percentPositive: null,
        percentNegative: null,
        failures: failureCount,
        statCases: statCount,
        avgTat: tatN ? (tatSum / tatN) : null,
        statAvgTat: tatStatN ? (tatStatSum / tatStatN) : null,
        tatOverStdPct: tatN ? (tatOverStd * 100.0 / tatN) : null,
      })
    }
    return rows
  }, [testsArray, vizYear, detectFlags, tatStandardHours, isCyto])

  // Custom date range daily aggregation for KPI visualizations
  const rangeTable = useMemo(() => {
    const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
    if (!ok(rangeStart) || !ok(rangeEnd)) return []
    // Build list of days and fast index lookup
    const days = enumerateDates(rangeStart, rangeEnd)
    if (!days.length) return []
    const idxMap = new Map(days.map((d, i) => [d, i]))

    const casesByDay = Array.from({ length: days.length }, () => new Map())
    const rowsByDay = Array.from({ length: days.length }, () => [])

    for (const t of testsArray) {
      if (!isCyto(t)) continue
      const wd = t.work_date ?? t.worksheet_date ?? t.workdate ?? t.date
      const iso = (typeof wd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wd)) ? wd : ''
      if (!iso) continue
      const di = idxMap.get(iso)
      if (di == null) continue
      rowsByDay[di].push(t)
      const caseKey = normalizeCaseNo(t.case_no || t.case || t.case_number || '')
      if (caseKey) {
        const bucket = casesByDay[di]
        if (!bucket.has(caseKey)) bucket.set(caseKey, { abn: false, fail: false, stat: false, prio0: false, tatSum: 0, tatN: 0 })
        const agg = bucket.get(caseKey)
        const abnRaw = (t.abn_norm == null ? '' : String(t.abn_norm)).trim().toUpperCase()
        if (abnRaw.startsWith('A')) agg.abn = true
        if (abnRaw.startsWith('F')) agg.fail = true
        const flags = detectFlags(t)
        if (flags.stat) agg.stat = true
        if (t.priority != null && Number(t.priority) === 0) agg.prio0 = true
        const th_case = (t.tat_hours != null && Number.isFinite(Number(t.tat_hours)) && Number(t.tat_hours) > 0) ? Number(t.tat_hours) : null
        if (th_case != null) { agg.tatSum += th_case; agg.tatN += 1 }
      }
    }

    const rows = []
    for (let i = 0; i < days.length; i++) {
      const monthRows = rowsByDay[i]
      const monthCases = casesByDay[i]
      const total = monthCases.size
      let abnormalCount = 0, failureCount = 0, statCount = 0
      let tatStatSum = 0, tatStatN = 0
      for (const [, info] of monthCases) {
        if (info.abn) abnormalCount++
        if (info.fail) failureCount++
        if (info.prio0) {
          statCount++
          if (info.tatN > 0) { tatStatSum += (info.tatSum / info.tatN); tatStatN++ }
        }
      }
      let tatSum = 0, tatN = 0, tatOverStd = 0
      for (const t of monthRows) {
        const th = (t.tat_hours != null && Number.isFinite(Number(t.tat_hours)) && Number(t.tat_hours) > 0) ? Number(t.tat_hours) : null
        if (th != null) {
          tatSum += th; tatN++
          if (tatStandardHours != null && th > tatStandardHours) tatOverStd++
        }
      }
      rows.push({
        date: days[i],
        total,
        abnormalCases: abnormalCount,
        failures: failureCount,
        statCases: statCount,
        avgTat: tatN ? (tatSum / tatN) : null,
        statAvgTat: tatStatN ? (tatStatSum / tatStatN) : null,
        tatOverStdPct: tatN ? (tatOverStd * 100.0 / tatN) : null,
      })
    }
    return rows
  }, [testsArray, rangeStart, rangeEnd, enumerateDates, detectFlags, tatStandardHours, isCyto])

  // Unique technicians discovered from tests in the uploaded dataset (period-independent), with unique-case counts
  // Falls back to row counts when case numbers are absent.
  const techSnapshot = useMemo(() => {
    const map = new Map()
    for (const t of testsArray) {
      if (!isCyto(t)) continue
      const techs = Array.isArray(t.analyzed_techs) ? t.analyzed_techs : extractTechNames(t.analyzed_by || '')
      if (!techs || !techs.length) continue
      const caseKey = normalizeCaseNo(t.case_no || t.case || t.case_number || '')
      for (const name of techs) {
        const nm = String(name || '').trim()
        if (!nm) continue
        if (!map.has(nm)) map.set(nm, { set: new Set(), rows: 0 })
        const entry = map.get(nm)
        if (caseKey) entry.set.add(caseKey)
        else entry.rows += 1
      }
    }
    const arr = Array.from(map.entries()).map(([name, info]) => ({
      name,
      initials: name.split(/\s+/).map(s => s[0] || '').join('').slice(0,2).toUpperCase(),
      cases: info.set.size > 0 ? info.set.size : info.rows,
    }))
    arr.sort((a,b) => a.name.localeCompare(b.name))
    return arr
  }, [testsArray, isCyto])

  // Per-technician KPIs across the uploaded tests (period independent)
  // - cases: unique cases attributed to the tech (fallback to row counts)
  // - avgTat: average of per-case TAT (hours), where per-case TAT is the mean across rows for that case
  // - abnormal: # of abnormal cases (A)
  // - failures: # of failure cases (F)
  const perTechKpis = useMemo(() => {
    const map = new Map() // name -> { cases:Set, abn:Set, fail:Set, tatByCase: Map(caseKey->{sum,n}), rows:number }
    testsArray.forEach((t, idx) => {
      if (!isCyto(t)) return
      const techs = Array.isArray(t.analyzed_techs) ? t.analyzed_techs : extractTechNames(t.analyzed_by || '')
      if (!techs || !techs.length) return
      const caseKey = (() => {
        const key = normalizeCaseNo(t.case_no || t.case || t.case_number || '')
        return key || `__row_${idx}`
      })()
      const abnRaw = (t.abn_norm == null ? '' : String(t.abn_norm)).trim().toUpperCase()
      const isAbn = abnRaw.startsWith('A')
      const isFail = abnRaw.startsWith('F')
      let rowTat = null
      if (t.tat_hours != null && Number.isFinite(Number(t.tat_hours)) && Number(t.tat_hours) > 0) {
        rowTat = Number(t.tat_hours)
      } else {
        const th = getTatHours(t)
        if (th != null && Number.isFinite(th) && th > 0) rowTat = th
      }
      techs.forEach((nameRaw) => {
        const name = String(nameRaw || '').trim()
        if (!name) return
        if (!map.has(name)) map.set(name, { cases: new Set(), abn: new Set(), fail: new Set(), tatByCase: new Map(), rows: 0 })
        const agg = map.get(name)
        agg.rows += 1
        agg.cases.add(caseKey)
        if (isAbn) agg.abn.add(caseKey)
        if (isFail) agg.fail.add(caseKey)
        if (rowTat != null) {
          if (!agg.tatByCase.has(caseKey)) agg.tatByCase.set(caseKey, { sum: 0, n: 0 })
          const tc = agg.tatByCase.get(caseKey)
          tc.sum += rowTat
          tc.n += 1
        }
      })
    })
    const arr = []
    for (const [name, agg] of map.entries()) {
      let tatSumMeans = 0, tatCases = 0
      for (const [, tc] of agg.tatByCase.entries()) {
        if (tc.n > 0) { tatSumMeans += (tc.sum / tc.n); tatCases++ }
      }
      const casesCount = agg.cases.size > 0 ? agg.cases.size : agg.rows
      const abnormalCount = agg.abn.size
      const failureCount = agg.fail.size
      const abnPct = casesCount > 0 ? (abnormalCount * 100.0 / casesCount) : null
      const failPct = casesCount > 0 ? (failureCount * 100.0 / casesCount) : null
      arr.push({
        name,
        initials: name.split(/\s+/).map(s => s[0] || '').join('').slice(0,2).toUpperCase(),
        cases: casesCount,
        abnormal: abnormalCount,
        failures: failureCount,
        abnPct,
        failPct,
        avgTat: tatCases ? (tatSumMeans / tatCases) : null,
      })
    }
    arr.sort((a,b) => (b.cases || 0) - (a.cases || 0) || a.name.localeCompare(b.name))
    return arr
  }, [testsArray, isCyto, getTatHours])

  // Sorted view for per-tech KPIs based on selected column/direction
  const perTechKpisSorted = useMemo(() => {
    const arr = [...perTechKpis]
    const { key, dir } = techSort || { key: 'cases', dir: 'desc' }
    const mul = dir === 'asc' ? 1 : -1
    const cmpNullLast = (a, b) => {
      const an = (a == null), bn = (b == null)
      if (an && bn) return 0
      if (an) return 1
      if (bn) return -1
      return 0
    }
    arr.sort((a, b) => {
      if (key === 'name') {
        const c = a.name.localeCompare(b.name)
        return mul * c
      }
      // numeric fields: cases, avgTat, abnormal, failures
      const av = a[key]
      const bv = b[key]
      const nl = cmpNullLast(av, bv)
      if (nl !== 0) return nl
      if (av < bv) return -1 * mul
      if (av > bv) return 1 * mul
      // tie-breaker by name
      return a.name.localeCompare(b.name)
    })
    return arr
  }, [perTechKpis, techSort])

  // Reviewers: unique-case counts per reviewer (fallback to row counts if no case numbers)
  const perReviewerCounts = useMemo(() => {
    const map = new Map() // name -> Set of unique case keys
    testsArray.forEach((t) => {
      if (!isCyto(t)) return
      const names0 = Array.isArray(t.reviewers) ? t.reviewers : extractTechNames(t.reviewed_by || '')
      const names = (names0 || []).filter(isLikelyPersonName)
      if (!names || !names.length) return
      const caseKey = normalizeCaseNo(t.case_no || t.case || t.case_number || '')
      if (!caseKey) return // only count unique case numbers
      names.forEach((raw) => {
        const name = String(raw || '').trim()
        if (!name) return
        if (!map.has(name)) map.set(name, new Set())
        map.get(name).add(caseKey)
      })
    })
    const arr = Array.from(map.entries()).map(([name, set]) => ({
      name,
      initials: name.split(/\s+/).map(s => s[0] || '').join('').slice(0,2).toUpperCase(),
      cases: set.size,
    }))
    arr.sort((a,b) => (b.cases || 0) - (a.cases || 0) || a.name.localeCompare(b.name))
    return arr
  }, [testsArray, isCyto])

  const perReviewerSorted = useMemo(() => {
    const arr = [...perReviewerCounts]
    const { key, dir } = reviewSort || { key: 'cases', dir: 'desc' }
    const mul = dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      if (key === 'name') return mul * a.name.localeCompare(b.name)
      const av = a[key], bv = b[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return -1 * mul
      if (av > bv) return 1 * mul
      return a.name.localeCompare(b.name)
    })
    return arr
  }, [perReviewerCounts, reviewSort])

  // QC: unique-case counts per QC performer (fallback to row counts if no case numbers)
  const perQcCounts = useMemo(() => {
    const map = new Map()
    testsArray.forEach((t) => {
      if (!isCyto(t)) return
      const names0 = Array.isArray(t.qc_people) ? t.qc_people : extractTechNames(t.qc_by || '')
      const names = (names0 || []).filter(isLikelyPersonName)
      if (!names || !names.length) return
      const caseKey = normalizeCaseNo(t.case_no || t.case || t.case_number || '')
      if (!caseKey) return // only count unique case numbers
      names.forEach((raw) => {
        const name = String(raw || '').trim()
        if (!name) return
        if (!map.has(name)) map.set(name, new Set())
        map.get(name).add(caseKey)
      })
    })
    const arr = Array.from(map.entries()).map(([name, set]) => ({
      name,
      initials: name.split(/\s+/).map(s => s[0] || '').join('').slice(0,2).toUpperCase(),
      cases: set.size,
    }))
    arr.sort((a,b) => (b.cases || 0) - (a.cases || 0) || a.name.localeCompare(b.name))
    return arr
  }, [testsArray, isCyto])

  const perQcSorted = useMemo(() => {
    const arr = [...perQcCounts]
    const { key, dir } = qcSort || { key: 'cases', dir: 'desc' }
    const mul = dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      if (key === 'name') return mul * a.name.localeCompare(b.name)
      const av = a[key], bv = b[key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return -1 * mul
      if (av > bv) return 1 * mul
      return a.name.localeCompare(b.name)
    })
    return arr
  }, [perQcCounts, qcSort])

  const onTechSort = useCallback((key) => {
    setTechSort(prev => {
      if (!prev || prev.key !== key) {
        return { key, dir: key === 'name' ? 'asc' : 'desc' }
      }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }, [])

  const sortIcon = (key) => (techSort.key === key ? (techSort.dir === 'asc' ? '▲' : '▼') : '')

  const onReviewSort = useCallback((key) => {
    setReviewSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: key === 'name' ? 'asc' : 'desc' }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }, [])

  const onQcSort = useCallback((key) => {
    setQcSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: key === 'name' ? 'asc' : 'desc' }
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }, [])

  const sortIconFor = (sort, key) => (sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '')

  const fmtPct = (v) => v == null ? 'n/a' : `${v.toFixed(1)}%`
  const fmtH = (v) => v == null ? 'n/a' : `${v.toFixed(1)} h`

  const styles = {
    container: { minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'transparent', color: 'var(--text)', overflowX: 'hidden' },
    header: { padding: 'clamp(1rem, 2.5vw, 1.5rem) clamp(1rem, 3vw, 1.5rem)', position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--card-border)', background: 'var(--header-bg)', backdropFilter: 'blur(10px) saturate(1.1)', WebkitBackdropFilter: 'blur(10px) saturate(1.1)', boxShadow: '0 8px 24px rgba(99,102,241,0.10)' },
    title: { margin: 0, fontSize: 'clamp(1.15rem, 1.6vw + 0.8rem, 1.6rem)', fontWeight: 800, letterSpacing: '-0.015em', lineHeight: 1.1, background: 'linear-gradient(90deg, var(--accent-start), var(--accent-mid), var(--accent-end))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textRendering: 'optimizeLegibility' },
    main: { flex: 1, display: 'grid', gap: 'clamp(0.5rem, 1.5vw, 1rem)', padding: 'clamp(0.75rem, 2vw, 1.25rem)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', maxWidth: 'min(1200px, 100%)', width: '100%', margin: '0 auto' },
    card: { background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: '12px', padding: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', backdropFilter: 'blur(6px)' },
    metricCard: { background: 'var(--surface-2)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '0.75rem', backdropFilter: 'blur(6px)' },
    miniCard: { background: 'var(--surface)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '0.75rem' },
    button: { margin: '0.5rem 0', padding: '0.55rem 0.9rem', background: 'linear-gradient(90deg, var(--accent-start), var(--accent-end))', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(59,130,246,0.25)' },
    buttonSecondary: { margin: '0.5rem 0', padding: '0.55rem 0.9rem', background: 'transparent', color: 'var(--text)', border: '1px solid var(--card-border)', borderRadius: '8px', cursor: 'pointer' },
    pre: { background: 'var(--surface-2)', padding: '0.75rem', borderRadius: '8px', overflowX: 'auto', border: '1px solid var(--card-border)', backdropFilter: 'blur(4px)', maxWidth: '100%', maxHeight: '45vh' },
    error: { color: 'var(--crit)' },
    input: { width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'var(--surface-2)', color: 'var(--text)' },
    footer: { padding: 'clamp(0.5rem, 2vw, 0.75rem) clamp(1rem, 3vw, 1.5rem)', borderTop: '1px solid var(--card-border)', textAlign: 'center', background: 'var(--footer-bg)', backdropFilter: 'blur(8px)' },
    badge: { display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, background: 'linear-gradient(90deg, rgba(148,163,184,0.25), rgba(148,163,184,0.15))', color: 'var(--text)', border: '1px solid var(--card-border)' },
    badgeOk: { background: 'linear-gradient(90deg, rgba(16,185,129,0.35), rgba(5,150,105,0.3))', border: '1px solid rgba(16,185,129,0.45)' },
    badgeWarn: { background: 'linear-gradient(90deg, rgba(245,158,11,0.35), rgba(234,179,8,0.3))', border: '1px solid rgba(245,158,11,0.45)' },
    badgeCrit: { background: 'linear-gradient(90deg, rgba(239,68,68,0.35), rgba(220,38,38,0.3))', border: '1px solid rgba(239,68,68,0.45)' },
    sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', marginBottom: '0.25rem' },
    subtle: { color: 'var(--muted)', fontSize: '0.85rem' },
    empGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.6rem' },
    empCard: { background: 'var(--surface)', border: '1px solid var(--card-border)', borderRadius: '10px', padding: '0.75rem' },
    avatar: { width: 36, height: 36, borderRadius: '9999px', background: 'linear-gradient(135deg, var(--accent-start), var(--accent-end))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
    nav: { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
    navLink: { padding: '0.45rem 0.75rem', borderRadius: '9999px', border: '1px solid var(--card-border)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' },
    navLinkActive: { background: 'linear-gradient(90deg, var(--accent-start), var(--accent-end))', color: '#fff', border: '1px solid transparent', boxShadow: '0 6px 18px rgba(59,130,246,0.25)' },
  }

  // Overall KPI score (client-side blend of statuses)
  const statusScore = useCallback((s) => {
    if (s === 'ok') return 100
    if (s === 'warning') return 67
    if (s === 'critical') return 33
    return 50
  }, [])

  const overall = useMemo(() => {
    const m = kpi?.metrics
    if (!m) return { score: 0, verdict: 'No data yet', variant: 'warning' }
    const score = Math.round(
      0.6 * statusScore(m.tat?.status) +
      0.4 * statusScore(m.cytogenetics_total_volume?.status)
    )
    let verdict = 'Needs attention', variant = 'warning'
    if (score >= 80) { verdict = 'Excellent'; variant = 'success' }
    else if (score >= 65) { verdict = 'Good'; variant = 'success' }
    else if (score < 50) { verdict = 'Critical'; variant = 'destructive' }
    return { score, verdict, variant }
  }, [kpi, statusScore])

  const improveSteps = useMemo(() => {
    const steps = []
    const th = kpiConfig?.kpis || {}
    const tatTh = th?.tat?.thresholds || {}
    if (kpi?.metrics?.tat?.status && kpi.metrics.tat.status !== 'ok') {
      const target = tatTh.warning ?? 48
      steps.push({ title: 'Turnaround Time', body: `Reduce average TAT below ${target}h to reach OK.` })
    }
    const cytoTh = th?.cytogenetics_total_volume?.thresholds || {}
    if (kpi?.metrics?.cytogenetics_total_volume?.status && kpi.metrics.cytogenetics_total_volume.status !== 'ok') {
      const min = cytoTh.warning
      steps.push({ title: 'Cytogenetics volume', body: `Increase Cytogenetics tests above ${min ?? 'target threshold'}.` })
    }
    return steps
  }, [kpi, kpiConfig])

  const Gauge = ({ value = 0, variant = 'success' }) => {
    const r = 56
    const c = 2 * Math.PI * r
    const v = Math.max(0, Math.min(100, value))
    const offset = c * (1 - v / 100)
    const col = variant === 'success' ? '#10b981' : (variant === 'warning' ? '#f59e0b' : '#ef4444')
    return (
      <svg width="160" height="160" viewBox="0 0 160 160" className="shrink-0">
        <circle cx="80" cy="80" r={r} stroke="#e5e7eb" strokeWidth="12" fill="none" />
        <circle cx="80" cy="80" r={r} stroke={col} strokeWidth="12" fill="none" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 80 80)" />
        <text x="80" y="80" dominantBaseline="middle" textAnchor="middle" fontSize="32" fontWeight="700" fill="#0f172a">{v}</text>
        <text x="80" y="104" dominantBaseline="middle" textAnchor="middle" fontSize="12" fill="#64748b">Overall Score</text>
      </svg>
    )
  }

  // Vertical multi-series grouped bar chart per technologist
  const TechMultiBarChart = ({ items = [] }) => {
    const data = Array.isArray(items) ? items : []
    // Series configuration: key in item, label, color, axis ('left' for counts/hours, 'right' for percentages)
    const series = [
      { key: 'cases', label: 'Cases', color: 'var(--accent-end)', axis: 'left' },
      { key: 'abnormal', label: 'Abn', color: '#f59e0b', axis: 'left' },
      { key: 'failures', label: 'Fail', color: '#ef4444', axis: 'left' },
      { key: 'avgTat', label: 'Avg TAT (h)', color: '#10b981', axis: 'left' },
      { key: 'abnPct', label: 'Abn %', color: '#6366f1', axis: 'right' },
      { key: 'failPct', label: 'Fail %', color: '#94a3b8', axis: 'right' },
    ]
    const leftMax = Math.max(
      1,
      ...data.map(d => Math.max(
        Number(d.cases) || 0,
        Number(d.abnormal) || 0,
        Number(d.failures) || 0,
        Number(d.avgTat) || 0,
      ))
    )
    const rightMax = 100 // percentages

    const margin = { top: 24, right: 44, bottom: 100, left: 44 }
    const innerH = 280
    const height = innerH + margin.top + margin.bottom
    const groupBarWidth = 12
    const barGap = 4
    const barsPerGroup = series.length
    const groupInnerWidth = barsPerGroup * groupBarWidth + (barsPerGroup - 1) * barGap
    const groupPad = 18
    const groupFullWidth = groupInnerWidth + groupPad * 2
    const width = data.length * groupFullWidth + margin.left + margin.right

    const yLeft = (v) => {
      const n = Number(v) || 0
      if (n <= 0) return innerH
      const h = (n / leftMax) * innerH
      return innerH - h
    }
    const yRight = (v) => {
      const n = Number(v) || 0
      if (n <= 0) return innerH
      const h = (n / rightMax) * innerH
      return innerH - h
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap text-xs text-slate-600">
          {series.map(s => (
            <div key={s.key} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded" style={{ background: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <svg width={width} height={height} role="img">
            {/* Background and axes labels */}
            <g transform={`translate(${margin.left},${margin.top})`}>
              {/* Left axis label */}
              <text x={-36} y={-6} fontSize="10" fill="#64748b">Counts/Hours</text>
              {/* Right axis label */}
              <text x={width - margin.left - margin.right - 12} y={-6} fontSize="10" fill="#64748b" textAnchor="end">Percent</text>
              {/* Horizontal grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                <g key={i}>
                  <line x1={0} x2={width - margin.left - margin.right} y1={innerH - t * innerH} y2={innerH - t * innerH} stroke="#e5e7eb" strokeWidth="1" />
                </g>
              ))}

              {/* Bars */}
              {data.map((d, i) => {
                const gx = i * groupFullWidth
                return (
                  <g key={d.name || i} transform={`translate(${gx + groupPad},0)`}>
                    {series.map((s, j) => {
                      const val = d[s.key]
                      const x = j * (groupBarWidth + barGap)
                      const y = s.axis === 'left' ? yLeft(val) : yRight(val)
                      const h = innerH - y
                      return (
                        <g key={s.key}>
                          <rect x={x} y={y} width={groupBarWidth} height={Math.max(0, h)} fill={s.color} rx={2} />
                          {h > 8 && (
                            <text x={x + groupBarWidth / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="#334155">
                              {val == null ? '' : (typeof val === 'number' ? (s.axis === 'right' ? `${val.toFixed(1)}%` : (s.key === 'avgTat' ? `${val.toFixed(1)}h` : `${val}`)) : String(val))}
                            </text>
                          )}
                        </g>
                      )
                    })}
                    {/* X label */}
                    <text x={groupInnerWidth / 2} y={innerH + 14} textAnchor="middle" fontSize="10" fill="#334155" transform={`rotate(20, ${groupInnerWidth / 2}, ${innerH + 14})`}>
                      {d.name}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </div>
    )
  }
 
  // Monthly bar chart for total volume
  const MonthlyVolumeBarChart = ({ rows = [] }) => {
    const data = Array.isArray(rows) ? rows : []
    const maxVal = Math.max(1, ...data.map(r => Number(r.total) || 0))
    const margin = { top: 20, right: 20, bottom: 42, left: 44 }
    const innerH = 220
    const height = innerH + margin.top + margin.bottom
    const barW = 22
    const gap = 14
    const width = data.length * (barW + gap) + margin.left + margin.right
    const y = (v) => {
      const n = Number(v) || 0
      if (n <= 0) return innerH
      const h = (n / maxVal) * innerH
      return innerH - h
    }
    const ticks = 4
    const tickVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxVal * i) / ticks))
    return (
      <div className="space-y-2">
        <div className="text-xs text-slate-600">Monthly Total Volume</div>
        <div className="overflow-x-auto">
          <svg width={width} height={height} role="img" aria-label="Monthly cytogenetics volume">
            <g transform={`translate(${margin.left},${margin.top})`}>
              {tickVals.map((tv, i) => (
                <g key={i}>
                  <line x1={0} x2={width - margin.left - margin.right} y1={y(tv)} y2={y(tv)} stroke="#e5e7eb" strokeWidth="1" />
                  <text x={-8} y={y(tv)} textAnchor="end" fontSize="10" fill="#64748b">{tv}</text>
                </g>
              ))}
              {data.map((d, i) => {
                const x = i * (barW + gap)
                const val = Number(d.total) || 0
                const yy = y(val)
                const h = innerH - yy
                const label = val
                return (
                  <g key={d.monthIndex} transform={`translate(${x},0)`}>
                    <rect x={0} y={yy} width={barW} height={Math.max(0, h)} fill="var(--accent-end)" rx={3} />
                    {h > 12 && (
                      <text x={barW / 2} y={yy - 4} textAnchor="middle" fontSize="10" fill="#334155">{label}</text>
                    )}
                    <text x={barW / 2} y={innerH + 14} textAnchor="middle" fontSize="10" fill="#334155">{(d.monthName || '').slice(0, 3)}</text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </div>
    )
  }

  // Monthly line chart for TAT averages with standard threshold
  const MonthlyTatLineChart = ({ rows = [], tatStandard = 48 }) => {
    const data = Array.isArray(rows) ? rows : []
    const values = []
    data.forEach(r => {
      if (r.avgTat != null) values.push(Number(r.avgTat))
      if (r.statAvgTat != null) values.push(Number(r.statAvgTat))
    })
    const maxY = Math.max(1, tatStandard || 0, ...values)
    const margin = { top: 20, right: 20, bottom: 42, left: 44 }
    const innerH = 220
    const height = innerH + margin.top + margin.bottom
    const step = 36
    const width = data.length * step + margin.left + margin.right
    const x = (i) => i * step + step / 2
    const y = (v) => {
      const n = Number(v) || 0
      if (n <= 0) return innerH
      const h = (n / maxY) * innerH
      return innerH - h
    }
    const makePath = (key) => {
      let dStr = ''
      let started = false
      data.forEach((r, i) => {
        const v = r[key]
        if (v == null) { started = false; return }
        const px = x(i)
        const py = y(v)
        if (!started) { dStr += `M ${px} ${py}`; started = true } else { dStr += ` L ${px} ${py}` }
      })
      return dStr
    }
    const ticks = 4
    const tickVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxY * i) / ticks))
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
          <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#10b981' }} /> <span>Avg TAT (h)</span></div>
          <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#6366f1' }} /> <span>STAT Avg TAT (h)</span></div>
          <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded border border-dashed" style={{ background: 'transparent', borderColor: '#f59e0b' }} /> <span>Standard ({tatStandard}h)</span></div>
        </div>
        <div className="overflow-x-auto">
          <svg width={width} height={height} role="img" aria-label="Monthly TAT averages">
            <g transform={`translate(${margin.left},${margin.top})`}>
              {tickVals.map((tv, i) => (
                <g key={i}>
                  <line x1={0} x2={width - margin.left - margin.right} y1={y(tv)} y2={y(tv)} stroke="#e5e7eb" strokeWidth="1" />
                  <text x={-8} y={y(tv)} textAnchor="end" fontSize="10" fill="#64748b">{tv}</text>
                </g>
              ))}
              <line x1={0} x2={width - margin.left - margin.right} y1={y(tatStandard)} y2={y(tatStandard)} stroke="#f59e0b" strokeWidth="2" strokeDasharray="6,4" />
              <path d={makePath('avgTat')} fill="none" stroke="#10b981" strokeWidth="2" />
              <path d={makePath('statAvgTat')} fill="none" stroke="#6366f1" strokeWidth="2" />
              {data.map((r, i) => {
                const px = x(i)
                return (
                  <g key={r.monthIndex}>
                    <text x={px} y={innerH + 14} textAnchor="middle" fontSize="10" fill="#334155">{(r.monthName || '').slice(0, 3)}</text>
                    {r.avgTat != null && <circle cx={px} cy={y(r.avgTat)} r="3" fill="#10b981" />}
                    {r.statAvgTat != null && <circle cx={px} cy={y(r.statAvgTat)} r="3" fill="#6366f1" />}
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div className="flex items-center justify-between gap-3">
          <h1 style={styles.title}>Cytogenetics KPI Dashboard (MVP)</h1>
          <nav style={styles.nav}>
            <button
              style={{ ...styles.navLink, ...(activePage === 'dashboard' ? styles.navLinkActive : {}) }}
              onClick={() => setActivePage('dashboard')}
            >
              Dashboard
            </button>
            <button
              style={{ ...styles.navLink, ...(activePage === 'evaluation' ? styles.navLinkActive : {}) }}
              onClick={() => setActivePage('evaluation')}
            >
              Evaluation
            </button>
            <button
              style={{ ...styles.navLink, ...(activePage === 'kpi' ? styles.navLinkActive : {}) }}
              onClick={() => setActivePage('kpi')}
            >
              KPI
            </button>
          </nav>
        </div>
      </header>

      <main style={styles.main}>
        {activePage === 'dashboard' && (
        <div className="grid gap-4 items-start">
          {/* Karyotyping table at the very top, spanning full width */}
          <div className="space-y-4 lg:col-span-2" style={{ gridColumn: '1 / -1' }}>
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="flex items-center justify-between w-full gap-2">
                  <CardTitle>Karyotyping</CardTitle>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-slate-500 hidden sm:block">TAT standard: {tatStandardHours} h</div>
                    {/* Upload (+) to import CSV/XLS(X) and populate tests/productivity */}
                    <input
                      ref={unifiedFileRef}
                      type="file"
                      accept=".csv,.tsv,.xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={handleUnifiedFileSelected}
                    />
                    <Button variant="outline" onClick={handleUnifiedUploadClick} title="Add/Upload CSV/XLS(X)">＋</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-600">
                        <th className="py-1 pr-3">Month</th>
                        <th className="py-1 pr-3">Total Volume</th>
                        <th className="py-1 pr-3">Change Y/Y %</th>
                        <th className="py-1 pr-3">Change M/M %</th>
                        <th className="py-1 pr-3"># of Abnormal cases</th>
                        <th className="py-1 pr-3">% of Abnormal cases</th>
                        <th className="py-1 pr-3">Number of failures</th>
                        <th className="py-1 pr-3">Number of Stat cases</th>
                        <th className="py-1 pr-3">Average TAT</th>
                        <th className="py-1 pr-3">TAT for STAT cases</th>
                        <th className="py-1 pr-3">TAT % over standard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyTable.map((r) => (
                        <tr key={r.monthIndex} className="border-t border-slate-200">
                          <td className="py-1 pr-3 whitespace-nowrap">{r.monthName}</td>
                          <td className="py-1 pr-3 tabular-nums">{r.total}</td>
                          <td className="py-1 pr-3 tabular-nums" style={{ color: r.yoy == null ? '#64748b' : (r.yoy >= 0 ? '#10b981' : '#ef4444') }}>{fmtPct(r.yoy)}</td>
                          <td className="py-1 pr-3 tabular-nums" style={{ color: r.mom == null ? '#64748b' : (r.mom >= 0 ? '#10b981' : '#ef4444') }}>{fmtPct(r.mom)}</td>
                          <td className="py-1 pr-3 tabular-nums">{r.abnormalCases}</td>
                          <td className="py-1 pr-3 tabular-nums">{fmtPct(r.percentAbnormal)}</td>
                          <td className="py-1 pr-3 tabular-nums">{r.failures}</td>
                          <td className="py-1 pr-3 tabular-nums">{r.statCases}</td>
                          <td className="py-1 pr-3 tabular-nums">{fmtH(r.avgTat)}</td>
                          <td className="py-1 pr-3 tabular-nums">{fmtH(r.statAvgTat)}</td>
                          <td className="py-1 pr-3 tabular-nums">{fmtPct(r.tatOverStdPct)}</td>
                        </tr>
                      ))}
                      {/* Summary rows */}
                      {(() => {
                        const monthsWithData = monthlyTable.filter(r => r.total > 0)
                        const sumVolume = monthlyTable.reduce((a, r) => a + r.total, 0)
                        const avgVolume = monthsWithData.length ? (sumVolume / monthsWithData.length) : 0
                        const avgTatAll = (() => {
                          const vals = monthlyTable.map(r => ({ n: r.avgTat != null ? 1 : 0, v: r.avgTat || 0 }))
                          const n = vals.reduce((a, x) => a + x.n, 0)
                          const s = vals.reduce((a, x) => a + x.v, 0)
                          return n ? (s / n) : null
                        })()
                        const avgTatStatAll = (() => {
                          const vals = monthlyTable.map(r => ({ n: r.statAvgTat != null ? 1 : 0, v: r.statAvgTat || 0 }))
                          const n = vals.reduce((a, x) => a + x.n, 0)
                          const s = vals.reduce((a, x) => a + x.v, 0)
                          return n ? (s / n) : null
                        })()
                        const avgTATOverStd = (() => {
                          const vals = monthlyTable.map(r => ({ n: r.tatOverStdPct != null ? 1 : 0, v: r.tatOverStdPct || 0 }))
                          const n = vals.reduce((a, x) => a + x.n, 0)
                          const s = vals.reduce((a, x) => a + x.v, 0)
                          return n ? (s / n) : null
                        })()
                        const sumFailures = monthlyTable.reduce((a, r) => a + (r.failures || 0), 0)
                        const sumAbnormal = monthlyTable.reduce((a, r) => a + (r.abnormalCases || 0), 0)
                        const sumStat = monthlyTable.reduce((a, r) => a + (r.statCases || 0), 0)
                        return (
                          <>
                            <tr className="border-t border-slate-300 bg-slate-50 font-medium">
                              <td className="py-1 pr-3">AVERAGE</td>
                              <td className="py-1 pr-3 tabular-nums">{avgVolume.toFixed(0)}</td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3 tabular-nums">{fmtH(avgTatAll)}</td>
                              <td className="py-1 pr-3 tabular-nums">{fmtH(avgTatStatAll)}</td>
                              <td className="py-1 pr-3 tabular-nums">{fmtPct(avgTATOverStd)}</td>
                            </tr>
                            <tr className="border-t border-slate-300 bg-slate-100 font-semibold">
                              <td className="py-1 pr-3">SUM</td>
                              <td className="py-1 pr-3 tabular-nums">{sumVolume}</td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3 tabular-nums">{sumAbnormal}</td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3 tabular-nums">{sumFailures}</td>
                              <td className="py-1 pr-3 tabular-nums">{sumStat}</td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3"></td>
                              <td className="py-1 pr-3"></td>
                            </tr>
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        )}

        {activePage === 'evaluation' && (
          <div className="grid gap-4 items-start">
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle>Technician Evaluation</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setTechEvalPage((p) => (p - 1 + 2) % 2)} title="Previous view">‹</Button>
                    <span style={styles.badge}>{techEvalPage === 0 ? 'Table' : 'Multi-Bar Chart'}</span>
                    <Button variant="outline" onClick={() => setTechEvalPage((p) => (p + 1) % 2)} title="Next view">›</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {perTechKpis.length === 0 ? (
                    <div className="text-sm text-slate-500">No technicians detected in the uploaded tests. Ensure the file includes an "Analyzed by" column.</div>
                  ) : (
                    techEvalPage === 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500">
                              <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onTechSort('name')}>Technologist {sortIcon('name')}</th>
                              <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onTechSort('cases')}>Cases Worked {sortIcon('cases')}</th>
                              <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onTechSort('avgTat')}>Average TAT {sortIcon('avgTat')}</th>
                              <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onTechSort('abnormal')}>Abnormal {sortIcon('abnormal')}</th>
                              <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onTechSort('failures')}>Failures {sortIcon('failures')}</th>
                              <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onTechSort('abnPct')}>Abnormal % {sortIcon('abnPct')}</th>
                              <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onTechSort('failPct')}>Failure % {sortIcon('failPct')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {perTechKpisSorted.map((t, idx) => (
                              <tr key={t.name || idx} className="border-t border-slate-200">
                                <td className="py-1 pr-3">
                                  <div className="flex items-center gap-2">
                                    <div style={styles.avatar}>{t.initials || 'T'}</div>
                                    <div className="leading-tight">
                                      <div className="font-medium">{t.name}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-1 pr-3 tabular-nums">{t.cases}</td>
                                <td className="py-1 pr-3 tabular-nums">{t.avgTat == null ? '' : `${t.avgTat.toFixed(1)} h`}</td>
                                <td className="py-1 pr-3 tabular-nums">{t.abnormal}</td>
                                <td className="py-1 pr-3 tabular-nums">{t.failures}</td>
                                <td className="py-1 pr-3 tabular-nums">{fmtPct(t.abnPct)}</td>
                                <td className="py-1 pr-3 tabular-nums">{fmtPct(t.failPct)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <TechMultiBarChart items={perTechKpisSorted} />
                    )
                  )}
                </CardContent>
              </Card>
            </div>
            {/* Reviewers & QC tables side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Reviewers</CardTitle>
                </CardHeader>
                <CardContent>
                  {perReviewerCounts.length === 0 ? (
                    <div className="text-sm text-slate-500">No reviewers detected. Ensure the file includes a "Reviewed by" column (typically column P).</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onReviewSort('name')}>Reviewer {sortIconFor(reviewSort, 'name')}</th>
                            <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onReviewSort('cases')}>Unique Cases {sortIconFor(reviewSort, 'cases')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {perReviewerSorted.map((r, idx) => (
                            <tr key={r.name || idx} className="border-t border-slate-200">
                              <td className="py-1 pr-3">
                                <div className="flex items-center gap-2">
                                  <div style={styles.avatar}>{r.initials || 'R'}</div>
                                  <div className="leading-tight">
                                    <div className="font-medium">{r.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-1 pr-3 tabular-nums">{r.cases}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>QC</CardTitle>
                </CardHeader>
                <CardContent>
                  {perQcCounts.length === 0 ? (
                    <div className="text-sm text-slate-500">No QC performers detected. Ensure the file includes a "Do QC"/"QC By" column (typically column R).</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500">
                            <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onQcSort('name')}>QC By {sortIconFor(qcSort, 'name')}</th>
                            <th className="py-1 pr-3 cursor-pointer select-none" onClick={() => onQcSort('cases')}>Unique Cases {sortIconFor(qcSort, 'cases')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {perQcSorted.map((q, idx) => (
                            <tr key={q.name || idx} className="border-t border-slate-200">
                              <td className="py-1 pr-3">
                                <div className="flex items-center gap-2">
                                  <div style={styles.avatar}>{q.initials || 'Q'}</div>
                                  <div className="leading-tight">
                                    <div className="font-medium">{q.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-1 pr-3 tabular-nums">{q.cases}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            {/* Score card removed from Evaluation per request */}
          </div>
        )}

        {activePage === 'kpi' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full gap-2">
                  <CardTitle>Yearly Visualizations (CYTO)</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => shiftVizYear(-1)} title="Previous Year">‹</Button>
                    <span style={styles.badge}>Year {vizYear}</span>
                    <Button variant="outline" onClick={() => shiftVizYear(1)} title="Next Year">›</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div className="min-w-0">
                    <MonthlyVolumeBarChart rows={monthlyVizTable} />
                  </div>
                  <div className="min-w-0">
                    <MonthlyTatLineChart rows={monthlyVizTable} tatStandard={tatStandardHours} />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full gap-2">
                  <CardTitle>Custom Date Range Visualizations (CYTO)</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-slate-600">Start
                      <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="ml-1 border border-slate-200 rounded px-2 py-1 text-sm" />
                    </label>
                    <label className="text-xs text-slate-600">End
                      <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="ml-1 border border-slate-200 rounded px-2 py-1 text-sm" />
                    </label>
                    <Button variant="outline" onClick={resetRangeToCurrentMonth} title="Reset to current month">Reset</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {rangeTable.length === 0 ? (
                  <div className="text-sm text-slate-500">Select a valid start and end date within your uploaded data to view charts.</div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="min-w-0">
                      <DailyVolumeBarChart rows={rangeTable} />
                    </div>
                    <div className="min-w-0">
                      <DailyTatLineChart rows={rangeTable} tatStandard={tatStandardHours} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <small>HIPAA-aware: no PHI displayed</small>
      </footer>
    </div>
  )
}

