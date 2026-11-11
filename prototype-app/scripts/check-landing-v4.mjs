// Run with a browser's page.evaluate(assertLandingV4Layout) after loading / or /#/v4.
export function assertLandingV4Layout() {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  assert(['', '#/', '#/v4'].includes(location.hash.split('?')[0]), 'Expected a V4 landing route')
  assert(document.querySelectorAll('main > section').length === 5, 'Five content sections while the cases and client logos are hidden')
  assert(document.documentElement.scrollWidth <= innerWidth, 'Horizontal overflow')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const video = document.querySelector('#v2-hero video')
  assert(video?.loop && video.muted && video.playsInline && video.poster.endsWith('/video/hero.jpg'), 'Hero video must loop with a poster and no audio')
  assert(video.autoplay === !reduced, 'Hero video must respect reduced motion')
  assert(!document.querySelector('main .v2-hero__pause, main .v4-map-toggle'), 'The hero and map must have no playback icons')
  const motionToggle = document.querySelector('footer .v4-motion-toggle')
  assert(motionToggle && Boolean(motionToggle.getClientRects().length) === !reduced, 'The footer motion control must be available when motion is enabled')
  const box = selector => document.querySelector(selector).getBoundingClientRect()
  const header = document.querySelector('.v4 header')
  assert(box('.v4 header a').right <= box('.v4 header nav').left, 'Header controls overlap the brand')
  const headerStart = header.querySelector('nav a[data-campaign-start]')
  assert(headerStart?.getAttribute('href') === '#/v4/create' && headerStart.getClientRects().length > 0, 'The visible header CTA must open V4 campaign setup')
  assert(!header.querySelector('a[href*="/login"]'), 'V4 header must not link to the old login')

  const hero = box('#v2-hero')
  const content = box('.v4-content')
  assert(Math.abs(hero.left - content.left) <= 1 && Math.abs(hero.right - content.right) <= 1, 'Hero must align with the page sections')
  if (innerHeight >= 480) assert(box('#v2-hero [data-campaign-start]').bottom <= innerHeight, 'Hero CTA must be visible on entry')
  if (innerWidth >= 1500 && innerHeight >= 900) {
    assert(hero.height <= 760, 'Hero height must be capped on a large screen')
    assert(hero.bottom + 16 < innerHeight, 'The next section should be visible on a large screen')
  }
  const heroPhone = box('.v2-hero__phone')
  if (heroPhone.width) {
    assert(box('.v2-hero__text').right + 16 <= heroPhone.left, 'Hero text must not overlap the phone')
    const heroOffer = box('.v2-hero__phone .app-shot-offer')
    assert(heroOffer.top >= hero.top && heroOffer.bottom <= hero.bottom, 'Hero must show the whole ad on the phone')
  } else {
    assert(box('.v2-hero__offer').top >= box('.v2-hero__text').bottom, 'Compact hero must show the ad below the text')
  }
  const intro = box('.v2-sketch-metrics__intro'), figures = box('.v2-sketch-metrics dl'), map = box('.v4-audience-map')
  if (innerWidth >= 900) {
    const section = box('.v2-sketch-metrics')
    assert(Math.abs(map.top - section.top) <= 1 && Math.abs(map.bottom - section.bottom) <= 1, 'Map must fill the height of the metrics section')
    assert(Math.abs(map.right - section.right) <= 1 && Math.abs(map.left - (section.left + section.width * .48)) <= 1, 'Map must fill the right half of the section')
    assert(intro.right <= map.left, 'The heading must stay beside the map')
  } else {
    assert(map.height > 0 && map.bottom + 8 <= figures.top, 'Map must stay above the figures on compact screens')
    assert(intro.bottom + 8 <= map.top, 'Map must stay below the heading on compact screens')
  }
  for (const value of document.querySelectorAll('.v2-sketch-metrics dd')) {
    assert(value.scrollWidth <= value.clientWidth + 1, 'Metrics value must fit its column')
  }

  const steps = [...document.querySelectorAll('.v4-stack-card')]
  assert(steps.length === 4, 'All four story steps must remain in the document')
  const stacked = !reduced && innerWidth >= 900 && innerHeight >= 720
  for (const step of steps) {
    assert(getComputedStyle(step.parentElement).position === (stacked ? 'sticky' : 'relative'), 'Step stacking must adapt to the viewport and motion preference')
    const card = step.getBoundingClientRect()
    const copy = step.querySelector('.v4-stack-copy').getBoundingClientRect()
    const art = step.querySelector('.v4-stack-art').getBoundingClientRect()
    const visual = step.querySelector('.v4-stack-visual').getBoundingClientRect()
    assert(copy.top >= card.top && copy.bottom <= card.bottom && copy.right <= card.right, 'Step explanation must stay inside its card')
    assert(art.top >= visual.top - 1 && art.bottom <= visual.bottom + 1, 'Step illustration must fit its panel')
    if (innerWidth >= 768) assert(copy.right + 16 <= visual.left, 'Step text and illustration must stay separated')
    if (stacked) {
      const heading = document.querySelector('.v4-how-head')
      const stickyTop = parseFloat(getComputedStyle(step.parentElement).top)
      assert(stickyTop >= parseFloat(getComputedStyle(heading).top) + heading.offsetHeight + 8, 'The sticky heading must not cover the step')
      assert(step.offsetHeight + stickyTop <= innerHeight - 8, 'Every stacked card must fit beneath the headers')
    }
  }
  const placements = [...document.querySelectorAll('.v4-placement-choice')]
  assert(placements.length === 4 && placements.filter(button => button.getAttribute('aria-pressed') === 'true').length === 1, 'Exactly one placement must be selected')
  for (const button of placements) {
    assert(button.getBoundingClientRect().height >= 44, 'Placement buttons must have comfortable touch targets')
    assert(button.scrollWidth <= button.clientWidth + 1, 'Placement label must fit')
  }
  if (innerWidth < 768) {
    assert(box('#v4-placement-phone').bottom <= box('.v4-placement-start').top, 'On mobile the CTA follows the placement preview')
  }
  const phone = document.querySelector('#v4-placement-phone .app-shot-phone')
  const background = phone.querySelector('.app-shot-background')
  assert(background.complete && background.naturalWidth > 0 && background.getAttribute('src').includes('/app-clean/'), 'Sanitized app screenshot must load')
  const offer = phone.querySelector('.app-shot-offer').getBoundingClientRect()
  const frame = phone.getBoundingClientRect()
  assert(offer.left >= frame.left && offer.right <= frame.right && offer.bottom < frame.bottom, 'Offer must stay inside the phone')
  assert(phone.querySelector('.cr').getBoundingClientRect().height >= frame.height * .1, 'Creative must remain visible in a compact phone')
  if (phone.querySelector('.app-shot-offer--main')) assert(offer.bottom <= frame.top + frame.height * .55, 'Main offer must not cover the SIM controls')
  assert(!document.querySelector('.v4 .v2-clients'), 'Client logos block must be hidden')
  const dots = [...document.querySelectorAll('.v4-pulse-dots circle')]
  assert(dots.length === 240, 'All audience positions can pulse')
  assert(new Set(dots.map(dot => dot.style.animationDuration)).size > 200, 'Dots must have independent pulse timings')
  const running = document.querySelector('.v2-sketch-metrics').dataset.pulsing === 'true'
  const mapMotion = getComputedStyle(document.querySelector('.v4-audience-map > svg'))
  if (reduced) {
    assert(mapMotion.animationName === 'none', 'Map zoom must respect reduced motion')
    assert(dots.every(dot => getComputedStyle(dot).animationName === 'none'), 'Map animation must respect reduced motion')
  } else {
    assert(mapMotion.animationName === 'v4-map-zoom' && mapMotion.animationDirection === 'alternate', 'The map must zoom smoothly in both directions')
    assert(mapMotion.animationPlayState === (running ? 'running' : 'paused'), 'Map zoom must follow the same playback state as the dots')
    assert(dots.every(dot => getComputedStyle(dot).animationIterationCount === 'infinite'), 'Audience pulses must loop')
    assert(dots.every(dot => getComputedStyle(dot).animationPlayState === (running ? 'running' : 'paused')), 'Dot playback must follow visibility and pause state')
  }
  return `PASS: V4 content, navigation and selection invariants at ${innerWidth}px`
}
