import { useEffect, useRef, useState } from 'react'
import LandingV4 from './LandingV4'
import { createAudienceNetwork } from './audience-network'
import './landing-v5.css'

const chapters = [
  { name: 'Клиенты', at: 0, caption: 'Каждая точка — клиент билайна.' },
  { name: 'Связи', at: .51, caption: 'Кофейня «Зерно» ищет гостей для утренней акции. У каждого клиента свой набор признаков.' },
  { name: 'Совпадения', at: .96, caption: 'Для утренней акции кофейни «Зерно» подойдут те, кто любит кофе и бывает рядом по утрам.' },
]
const staticScene = '(prefers-reduced-motion: reduce), (max-height: 560px)'

function AudienceScene() {
  const section = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const choose = useRef<(index: number) => void>(() => {})
  const [chapter, setChapter] = useState(0)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const root = section.current!, runway = track.current!, surface = canvas.current!
    const context = surface.getContext('2d')
    if (window.location.hash === '#audience') root.scrollIntoView({ behavior: 'instant' })
    if (!context) { setFallback(true); setChapter(2); return }

    const style = getComputedStyle(root)
    const draw = createAudienceNetwork(context, style.getPropertyValue('--color-brand-primary').trim(), style.getPropertyValue('--network-paper').trim())
    const preference = window.matchMedia(staticScene)
    let still = 1, visible = false, frame = 0, disposed = false
    let lastProgress = -1, lastWidth = 0, lastHeight = 0, lastDpr = 0, activeChapter = -1
    function render() {
      frame = 0
      if (!visible || disposed) return
      const width = surface.clientWidth, height = surface.clientHeight
      if (!width || !height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const distance = runway.offsetHeight
      const top = parseFloat(getComputedStyle(root).getPropertyValue('--network-top'))
      const progress = preference.matches || !distance ? still
        : Math.max(0, Math.min(1, (top - root.getBoundingClientRect().top) / distance))
      const resized = width !== lastWidth || height !== lastHeight || dpr !== lastDpr
      if (!resized && progress === lastProgress) return
      if (resized) {
        surface.width = Math.round(width * dpr)
        surface.height = Math.round(height * dpr)
        context!.setTransform(surface.width / width, 0, 0, surface.height / height, 0, 0)
      }
      lastWidth = width; lastHeight = height; lastDpr = dpr; lastProgress = progress
      draw(width, height, progress)
      const nextChapter = progress < .33 ? 0 : progress < .68 ? 1 : 2
      if (nextChapter !== activeChapter) { activeChapter = nextChapter; setChapter(nextChapter) }
    }
    function schedule() {
      if (visible && !disposed && !frame) frame = requestAnimationFrame(render)
    }
    function invalidate() { lastProgress = -1; schedule() }
    function modeChanged() { still = 1; invalidate() }
    choose.current = index => {
      const to = chapters[index].at
      if (preference.matches) { still = to; schedule(); return }
      const inset = parseFloat(getComputedStyle(root).getPropertyValue('--network-top'))
      const top = window.scrollY + root.getBoundingClientRect().top - inset + runway.offsetHeight * to
      window.scrollTo({ top, behavior: 'smooth' })
    }
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      schedule()
    }, { rootMargin: '160px 0px' })
    visibility.observe(root)
    const resize = new ResizeObserver(invalidate)
    resize.observe(surface)
    resize.observe(root)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    preference.addEventListener('change', modeChanged)
    void document.fonts.ready.then(invalidate)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      visibility.disconnect(); resize.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      preference.removeEventListener('change', modeChanged)
      choose.current = () => {}
    }
  }, [])

  return <section id="audience" className="v5-audience" ref={section} data-fallback={fallback || undefined} aria-labelledby="v5-title">
    <div className="v5-track" ref={track} aria-hidden="true"/>
    <div className="v5-frame">
      <header className="v5-heading">
        <h2 id="v5-title">ваши клиенты <br/>уже здесь</h2>
        <dl className="v5-facts">
          <div><dt>абонентов билайна</dt><dd>30<span>+</span> <small>млн</small></dd></div>
          <div><dt>триггеров показа</dt><dd>200</dd></div>
        </dl>
      </header>
      <figure className="v5-figure">
        <div className="v5-field">
          <canvas ref={canvas} aria-hidden="true"/>
          {fallback && <ol className="v5-fallback-chain"><li>клиент</li><li>кофе</li><li>рядом</li><li>утром</li></ol>}
        </div>
        <figcaption className="v5-footer">
          <p>{chapters[chapter].caption}</p>
          {!fallback && <div role="group" aria-label="Этапы подбора аудитории" className="v5-chapters">
            {chapters.map((item, index) => <button type="button" key={item.name} aria-pressed={chapter === index}
              onClick={() => choose.current(index)}>{item.name}</button>)}
          </div>}
        </figcaption>
      </figure>
    </div>
  </section>
}

export default function LandingV5() {
  return <LandingV4 audience={<AudienceScene/>}/>
}
