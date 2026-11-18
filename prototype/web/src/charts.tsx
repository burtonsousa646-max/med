import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Один ряд — один цвет. Выделенный столбец тёмный, остальные серые. Жёлтый в графиках не используем: он для действий.
const INK = 'var(--color-background-secondary-invert)'
const MUTED = 'var(--color-static-grey-100)'
const AXIS = { fontSize: 12, fill: 'var(--color-text-secondary)', fontFamily: 'var(--font-primary)' }

type Row = { label: string; value: number }

type TipProps = { active?: boolean; payload?: readonly { value?: unknown; payload?: { label?: string } }[]; label?: unknown; fmt: (v: number) => string }
function Tip({ active, payload, label, fmt }: TipProps) {
  if (!active || !payload?.length) return null
  return <div className="chart-tip"><span>{String(label ?? payload[0].payload?.label ?? '')}</span><b>{fmt(Number(payload[0].value))}</b></div>
}

export function Bars({ data, fmt, height = 200, hi = data.length - 1, label }: { data: Row[]; fmt: (v: number) => string; height?: number; hi?: number; label: string }) {
  return (
    <div className="chart" role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap={4}>
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis hide />
          <Tooltip cursor={{ fill: 'var(--color-background-primary)' }} content={p => <Tip {...p} fmt={fmt} />} isAnimationActive={false} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={700}>
            {data.map((_, i) => <Cell key={i} fill={i === hi ? INK : MUTED} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function HBars({ data, fmt, hi, onPick, label }: { data: (Row & { id: string })[]; fmt: (v: number) => string; hi?: string; onPick?: (id: string) => void; label: string }) {
  return (
    <div className="chart" role="img" aria-label={label} style={{ height: data.length * 40 + 8 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={150} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: 'var(--color-background-primary)' }} content={p => <Tip {...p} fmt={fmt} />} isAnimationActive={false} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={700} onClick={(d: any) => onPick?.(d.id)}
            label={{ position: 'right', fill: 'var(--color-text-primary)', fontSize: 13, formatter: (v: any) => fmt(Number(v)) }} style={{ cursor: onPick ? 'pointer' : undefined }}>
            {data.map(d => <Cell key={d.id} fill={d.id === hi ? INK : MUTED} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Trend({ data, fmt, height = 180, axis = true, label, invert }: { data: Row[]; fmt: (v: number) => string; height?: number; axis?: boolean; label: string; invert?: boolean }) {
  const stroke = invert ? 'var(--color-static-white)' : INK
  const id = `g-${label.length}-${height}`
  return (
    <div className="chart" role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={stroke} stopOpacity={0.16} />
              <stop offset="1" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          {axis && <XAxis dataKey="label" tick={invert ? { ...AXIS, fill: 'var(--color-static-grey-100)' } : AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />}
          <YAxis hide domain={[0, 'dataMax']} />
          <Tooltip cursor={{ stroke: invert ? 'var(--color-static-grey-500)' : 'var(--color-static-grey-100)', strokeWidth: 1 }} content={p => <Tip {...p} fmt={fmt} />} isAnimationActive={false} />
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill={`url(#${id})`} activeDot={{ r: 5, strokeWidth: 2, stroke: invert ? 'var(--color-static-grey-900)' : 'var(--color-static-white)' }} animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
