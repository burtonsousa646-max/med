// The same client retains its coordinates, attributes and neighbours at every zoom level.
const interests = ['кофе', 'кино', 'книги', 'спорт', 'театр', 'музыка', 'поездки', 'фото', 'дизайн']
const places = ['рядом', 'в центре', 'за городом', 'в пути']
const times = ['утром', 'днём', 'вечером', 'в выходные']
const focusWords = [interests[0], places[0], times[0]]
const categories = ['интерес', 'место', 'время']

type Point = { x: number; y: number }
type Client = { x: number; y: number; seed: number; bend: number; words: string[]; main: boolean }
type Chain = { client: Client; nodes: Point[] }
type Label = Point & { value: string; size: number; ink: string; align: CanvasTextAlign; main: boolean }
type Bounds = { left: number; right: number; top: number; bottom: number }

const clamp = (n: number) => Math.max(0, Math.min(n, 1))
function ease(from: number, to: number, n: number) {
  const t = clamp((n - from) / (to - from))
  return t * t * (3 - 2 * t)
}

function clientAt(row: number, col: number): Client {
  let state = (Math.imul(row + 133, 73856093) ^ Math.imul(col + 97, 19349663)) >>> 0
  state = Math.imul(state ^ (state >>> 16), 0x85ebca6b)
  state ^= state >>> 13
  function random() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
  const seed = random(), bend = random()
  const main = row === 0 && col === 0
  const x = (col + (row & 1) * .44) * 4.65 + (random() - .5) * 1.05
  const y = row * .92 + .19 * Math.sin(.56 * x + row * .31) + (random() - .5) * .17
  const words = [interests, places, times].map(values => values[Math.floor(random() * values.length)])
  if (main) return { x: 0, y: 0, seed, bend, main, words: focusWords }
  // Neighbouring examples share a signal; the complete combination belongs to the central chain.
  if (row === -1 && col === 0) words.splice(0, 3, 'кофе', 'в пути', 'вечером')
  if (row === 1 && col === 0) words.splice(0, 3, 'кино', 'рядом', 'днём')
  return { x, y, seed, bend, main, words }
}

function disk(ctx: CanvasRenderingContext2D, p: Point, radius: number) {
  ctx.moveTo(p.x + radius, p.y)
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
}

function pointOnLink(a: Point, b: Point, t: number, vertical: boolean) {
  const s = t * t * (3 - 2 * t)
  return { x: a.x + (b.x - a.x) * (vertical ? s : t), y: a.y + (b.y - a.y) * (vertical ? t : s) }
}

// Cubic with horizontal (or portrait vertical) tangents. The shortened segment uses the same curve.
function link(ctx: CanvasRenderingContext2D | Path2D, a: Point, b: Point, vertical: boolean, t = 1) {
  const dx = b.x - a.x, dy = b.y - a.y, end = pointOnLink(a, b, t, vertical)
  const tx = vertical ? 0 : dx / 3, ty = vertical ? dy / 3 : 0
  const slope = 2 * t * t * (1 - t)
  ctx.moveTo(a.x, a.y)
  ctx.bezierCurveTo(a.x + tx * t, a.y + ty * t,
    end.x - (vertical ? dx * slope : tx * t), end.y - (vertical ? ty * t : dy * slope), end.x, end.y)
}

export function createAudienceNetwork(ctx: CanvasRenderingContext2D, gold: string, paper: string) {
  const cache = new Map<string, Client>()
  const font = getComputedStyle(ctx.canvas).fontFamily

  return function draw(width: number, height: number, progress: number) {
    ctx.clearRect(0, 0, width, height)
    const vertical = width < 560 && height > width * .62
    const length = vertical ? height : width, across = vertical ? width : height
    const far = Math.max(4, length / 172), middle = Math.max(36, length / 14)
    const near = length * (vertical ? .193 : .211)
    const first = ease(.04, .48, progress), second = ease(.53, .87, progress)
    const scale = far * (middle / far) ** first * (near / middle) ** second
    const open = ease(.10, .41, progress), detail = ease(.32, .50, progress)
    const focus = ease(.58, .79, progress), signal = 3 * ease(.68, .94, progress)
    const crossScale = vertical ? scale + second * Math.max(0, width * .43 - scale) : scale * (1 - second * .28)
    const cameraX = -2.8 + 3.9 * first + .71 * second
    const cameraY = .26 * (1 - first) + (vertical ? .20 * second : 0)
    const project = (x: number, y: number): Point => vertical
      ? { x: width * .45 + (y - cameraY) * crossScale, y: height * .5 + (x - cameraX) * scale }
      : { x: width * .5 + (x - cameraX) * scale, y: height * .5 + (y - cameraY) * crossScale }
    const pad = 1.8
    const rowStart = Math.floor((cameraY - across / crossScale * .6 - pad) / .92)
    const rowEnd = Math.ceil((cameraY + across / crossScale * .65 + pad) / .92)
    const colStart = Math.floor((cameraX - length / scale / 2 - 6) / 4.65)
    const colEnd = Math.ceil((cameraX + length / scale / 2 + 3) / 4.65)
    const dots = Array.from({ length: 5 }, () => new Path2D())
    const distantLinks = new Path2D(), distantSignals = new Path2D()
    const chains = new Map<string, Chain>()
    const key = (r: number, c: number) => r + ':' + c

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        const id = key(row, col)
        let person = cache.get(id)
        if (!person) { person = clientAt(row, col); cache.set(id, person) }
        const x = person.x + (1 - open) * (person.seed - .5) * 2.5
        const y = person.y + (1 - open) * (person.bend - .5) * .45
        const origin = project(x, y)
        if (open < 1) {
          const depth = .62 * person.seed + .19 * (1 + Math.sin(person.y * .36 + Math.sin(person.x * .10)))
          const layer = Math.min(4, Math.floor(depth * 5))
          const r = (.59 + layer * .17) * (1 + .30 * open)
          dots[layer].moveTo(origin.x + r, origin.y)
          dots[layer].arc(origin.x, origin.y, r, 0, Math.PI * 2)
        }
        if (open === 0) continue
        const bend = person.main ? -.21 : (person.bend - .5) * .48
        const offsets = [[1.15, bend], [2.45, -bend * .86], [3.65, bend * .52]]
        const nodes = [origin, ...offsets.map(([dx, dy]) => project(x + dx * open, y + dy * open))]
        if (detail === 0) {
          for (let i = 1; i < nodes.length; i++) {
            link(distantLinks, nodes[i - 1], nodes[i], vertical)
            distantSignals.moveTo(nodes[i].x + 1.5, nodes[i].y)
            distantSignals.arc(nodes[i].x, nodes[i].y, 1.5, 0, Math.PI * 2)
          }
          distantSignals.moveTo(origin.x + 2.5, origin.y)
          distantSignals.arc(origin.x, origin.y, 2.5, 0, Math.PI * 2)
          continue
        }
        chains.set(id, { client: person, nodes })
      }
    }
    dots.forEach((path, i) => {
      ctx.fillStyle = 'rgba(232,234,230,' + (.24 + i * .17) * (1 - open) + ')'
      ctx.fill(path)
    })
    if (open === 0) return
    if (detail === 0) {
      ctx.strokeStyle = 'rgba(187,200,200,' + open * .34 + ')'
      ctx.lineWidth = 1; ctx.stroke(distantLinks)
      ctx.fillStyle = 'rgba(174,185,181,' + open * .8 + ')'; ctx.fill(distantSignals)
      return
    }

    ctx.lineCap = 'round'
    const secondary = new Path2D()
    for (let r = rowStart + 1; r <= rowEnd; r++) {
      for (let c = colStart; c <= colEnd; c++) {
        const chain = chains.get(key(r, c))
        if (!chain) continue
        for (const otherCol of [c, c + ((r & 1) ? 1 : -1)]) {
          const other = chains.get(key(r - 1, otherCol))
          if (!other) continue
          chain.client.words.forEach((word, i) => {
            if (word !== other.client.words[i]) return
            const a = chain.nodes[i + 1], b = other.nodes[i + 1]
            secondary.moveTo(a.x, a.y)
            secondary.bezierCurveTo((a.x + b.x) / 2, a.y, (a.x + b.x) / 2, b.y, b.x, b.y)
          })
        }
      }
    }
    ctx.strokeStyle = 'rgba(143,159,161,' + .23 * detail + ')'
    ctx.lineWidth = .85
    ctx.stroke(secondary)
    const labels: Label[] = []
    function drawChain({ client, nodes }: Chain) {
      const main = client.main
      const match = client.words.every((word, i) => word === focusWords[i])
      const strength = main ? 1 : 1 - focus * .44
      ctx.beginPath()
      for (let i = 0; i < 3; i++) link(ctx, nodes[i], nodes[i + 1], vertical)
      ctx.strokeStyle = 'rgba(187,200,200,' + open * strength * (main ? .69 : .34) + ')'
      ctx.lineWidth = main ? 1.6 : 1
      ctx.stroke()

      if (main || client.seed > .72) {
        const alt = project(client.x + 1.33 * open, client.y + .47 * open)
        ctx.beginPath(); link(ctx, nodes[0], alt, vertical)
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(151,160,160,' + .40 * open * strength + ')'; ctx.stroke()
        ctx.fillStyle = '#727977'; ctx.beginPath(); disk(ctx, alt, 2.2 * open); ctx.fill()
        const alternative = main ? 'книги' : interests[(interests.indexOf(client.words[0]) + 3) % interests.length]
        if (detail > 0) labels.push({
          x: alt.x + (vertical ? 8 : 0), y: alt.y + (vertical ? 0 : 14),
          value: alternative, size: 13, align: vertical ? 'left' : 'center', main: false, ink: '#909693',
        })
      }
      if (match && signal > 0) {
        ctx.strokeStyle = gold; ctx.lineWidth = main ? 2.6 : 1.8; ctx.beginPath()
        for (let i = 0; i < 3 && i < signal; i++) link(ctx, nodes[i], nodes[i + 1], vertical, Math.min(1, signal - i))
        ctx.stroke()
        if (signal < 3) {
          const leg = Math.floor(signal), pulse = pointOnLink(nodes[leg], nodes[leg + 1], signal - leg, vertical)
          ctx.fillStyle = gold; ctx.beginPath(); disk(ctx, pulse, 3.8); ctx.fill()
        }
      }
      nodes.forEach((p, i) => {
        const selected = match && signal > 0 && signal >= i
        const radius = Math.max(1, open * (i === 0 ? 4.3 + second * 2 : 2.4 + second * (main ? 2.2 : 1)))
        ctx.fillStyle = selected ? gold : (main ? '#d1d4cf' : '#969f9c')
        ctx.beginPath(); disk(ctx, p, radius); ctx.fill()
        if (i === 0 || (selected && main)) {
          ctx.fillStyle = paper
          ctx.beginPath(); disk(ctx, p, radius * .70); ctx.fill()
          ctx.fillStyle = selected ? gold : '#b8bfba'
          ctx.beginPath(); disk(ctx, p, radius * .33); ctx.fill()
        }
        if (detail === 0 || (!i && (!main || focus < .25))) return
        const value = i ? client.words[i - 1] : 'клиент'
        const size = main ? Math.round(15 + second * (i ? (vertical ? 9 : 17) : 3)) : Math.round(12 + second * 4)
        const x = p.x + (vertical ? (main ? 17 : 6) : 0)
        const y = p.y - (vertical ? 0 : size * .68 + 7)
        labels.push({ x, y, value, size, main, align: vertical ? 'left' : 'center',
          ink: selected ? gold : main ? '#f3f2ec' : '#a3aaa7' })
        if (i && main && focus > .65) labels.push({
          x: vertical ? p.x - 12 : p.x, y: vertical ? p.y : p.y + 17,
          value: categories[i - 1], size: vertical ? 12 : 14, align: vertical ? 'right' : 'center', main, ink: '#bcc1bc',
        })
      })
    }
    for (const chain of chains.values()) if (!chain.client.main) drawChain(chain)
    const hero = chains.get('0:0')
    if (hero) drawChain(hero)
    if (!labels.length) return
    // Prefer the example's labels; decorative neighbours may yield space at any viewport width.
    const occupied: Bounds[] = []
    ctx.textBaseline = 'middle'
    for (const label of labels.sort((a, b) => Number(b.main) - Number(a.main))) {
      if (label.x < -45 || label.x > width + 45 || label.y < 0 || label.y > height) continue
      ctx.font = label.size + 'px ' + font
      const w = ctx.measureText(label.value).width
      const left = label.x - (label.align === 'right' ? w : label.align === 'center' ? w / 2 : 0)
      const area = { left: left - 4, right: left + w + 4, top: label.y - label.size / 2 - 3, bottom: label.y + label.size / 2 + 3 }
      if (occupied.some(b => b.left < area.right && b.right > area.left && b.top < area.bottom && b.bottom > area.top)) continue
      occupied.push(area)
      ctx.textAlign = label.align
      ctx.globalAlpha = label.main ? detail : detail * (1 - focus * .46)
      ctx.lineWidth = 4; ctx.strokeStyle = paper; ctx.strokeText(label.value, label.x, label.y)
      ctx.fillStyle = label.ink; ctx.fillText(label.value, label.x, label.y)
    }
    ctx.globalAlpha = 1
  }
}
