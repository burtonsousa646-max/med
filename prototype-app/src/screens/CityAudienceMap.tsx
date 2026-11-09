import map from './moscow-audience.json'

export function CityAudienceMap({ timings }: { timings: { duration: number; delay: number }[] }) {
  return <figure className="v4-audience-map" aria-label="Карта Москвы. Точки показывают условную аудиторию, а не реальные местоположения абонентов.">
    <svg viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <image href="/img/moscow-audience-map.svg" width={map.width} height={map.height}/>
      <g fill="var(--color-brand-primary)" opacity=".45">
        {map.locations.map(point => <circle key={point.buildingId} cx={point.x} cy={point.y} r="2.4"/>)}
      </g>
      <g className="v4-pulse-dots" fill="var(--color-brand-primary)">
        {map.locations.map((point, index) => <circle key={point.buildingId} cx={point.x} cy={point.y} r="4" style={{ animationDuration: `${timings[index].duration}s`, animationDelay: `${timings[index].delay}s` }}/>)}
      </g>
    </svg>
  </figure>
}
