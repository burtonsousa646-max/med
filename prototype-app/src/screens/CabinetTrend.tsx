import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis, usePlotArea, useXAxisInverseDataSnapScale } from 'recharts'

type Point = { date: string; tickLabel?: string; current: number; previous?: number; priorDate?: string }
type Series = { key: 'current' | 'previous'; label: string; color: string; dashed?: boolean }
const number = new Intl.NumberFormat('ru-RU')
const axisNumber = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })
const tick = { fill: 'var(--crm-muted)', fontSize: 12 }

function PlotPicker({ onHover, onSelect }: { onHover: (day: string | null) => void; onSelect: (day: string) => void }) {
  const plot = usePlotArea()
  const dateAt = useXAxisInverseDataSnapScale()
  if (!plot || !dateAt) return null

  const pick = (element: SVGRectElement, clientX: number) => {
    const bounds = element.getBoundingClientRect()
    const date = dateAt(plot.x + (clientX - bounds.left) * plot.width / bounds.width)
    return typeof date === 'string' ? date : null
  }

  return <rect {...plot} className="crm-chart-picker" fill="transparent"
    onPointerMove={event => { if (event.pointerType === 'mouse') onHover(pick(event.currentTarget, event.clientX)) }}
    onPointerLeave={() => onHover(null)}
    onClick={event => { const date = pick(event.currentTarget, event.clientX); if (date !== null) onSelect(date) }}/>
}

export function CabinetTrend({ points, series, kind, label }: {
  points: Point[]
  series: Series[]
  kind: 'bar' | 'line'
  label: string
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const last = points.length - 1
  const selectedIndex = points.findIndex(point => point.date === (hovered ?? selected))
  const index = selectedIndex < 0 ? last : selectedIndex
  const point = points[index]
  if (!point) return null

  const tickLabels = new Map(points.map(item => [item.date, item.tickLabel ?? item.date]))
  const Chart = kind === 'line' ? LineChart : BarChart
  const date = (item: Point, key: Series['key']) => key === 'previous' && item.priorDate ? item.priorDate : item.date
  const valueText = series.map(({ key, label: name }) => `${date(point, key)}, ${name.toLowerCase()} — ${number.format(point[key] ?? 0)}`).join('. ')

  return <div className="crm-trend-data">
    <div className="crm-chart" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <Chart data={points} margin={{ left: 0, right: 10, top: 12, bottom: 4 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke="var(--crm-edge)" strokeDasharray="3 5"/>
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={20} tickMargin={8} tick={tick} tickFormatter={value => tickLabels.get(value) ?? value}
            padding={kind === 'line' ? { left: 8, right: 8 } : undefined}/>
          <YAxis domain={[0, (max: number) => Math.max(1, max)]} tickCount={4} allowDecimals={false}
            tickLine={false} axisLine={false} width={40} tick={tick} tickFormatter={axisNumber.format}/>
          <ReferenceLine x={point.date} stroke="var(--crm-muted)" strokeDasharray="3 4"/>
          {series.map(({ key, color, dashed }) => kind === 'line' ?
            <Line key={key} dataKey={key} stroke={color} strokeWidth={2.5} strokeDasharray={dashed ? '5 3' : undefined}
              dot={points.length === 1} isAnimationActive={false}/> :
            <Bar key={key} dataKey={key} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}/>)}
          {last > 0 && <PlotPicker onHover={setHovered} onSelect={date => { setHovered(null); setSelected(date) }}/>}
        </Chart>
      </ResponsiveContainer>
    </div>
    {last > 0 && <input className="crm-chart-range" type="range" min={0} max={last} value={index}
      aria-label={label} aria-valuetext={valueText}
      onFocus={() => setHovered(null)}
      onChange={event => { setHovered(null); setSelected(points[Number(event.target.value)].date) }}/>}
    <dl className="crm-chart-tip">
      {series.map(({ key, color, dashed, label: name }) => <div key={key}>
        <dt><i aria-hidden="true" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }}/><span>{name}<small>{date(point, key)}</small></span></dt>
        <dd>{number.format(point[key] ?? 0)}</dd>
      </div>)}
    </dl>
  </div>
}
