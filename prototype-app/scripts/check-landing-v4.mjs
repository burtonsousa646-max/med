// Run with a browser's page.evaluate(assertLandingV4Layout) after loading /#/v4.
export function assertLandingV4Layout() {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  assert(location.hash === '#/v4', 'Expected V4 route')
  assert(document.querySelectorAll('main > section').length === 5, 'Five content sections while the cases and client logos are hidden')
  assert(document.documentElement.scrollWidth <= innerWidth, 'Horizontal overflow')
  assert(!document.querySelector('.v4-playback, .v4-pulse-toggle, .v4 .v2-hero__pause'), 'V4 playback controls must be removed')
  const header = document.querySelector('header')
  if (innerWidth >= 600 && innerHeight >= 640) {
    const availableHeight = innerHeight - header.getBoundingClientRect().height - 24
    for (const section of document.querySelectorAll('main > section:not(#how)')) {
      assert(Math.abs(section.getBoundingClientRect().height - availableHeight) <= 1, `${section.id || 'Metrics'} must fill one screen below the sticky header`)
    }
    const metrics = document.querySelector('.v2-sketch-metrics').getBoundingClientRect()
    const intro = document.querySelector('.v2-sketch-metrics__intro').getBoundingClientRect()
    const figures = document.querySelector('.v2-sketch-metrics dl').getBoundingClientRect()
    assert(intro.bottom + 16 <= figures.top, 'Metrics heading and figures must not overlap')
    assert(figures.bottom - intro.top >= metrics.height * .6, 'Metrics content must use the screen height')
    const map = document.querySelector('.v4-audience-map').getBoundingClientRect()
    assert(map.bottom + 8 <= figures.top, 'Map must stay above the figures')
  }
  const brand = header.querySelector('a').getBoundingClientRect()
  const nav = header.querySelector('nav').getBoundingClientRect()
  assert(brand.right <= nav.left, 'Header controls overlap the brand')
  const heroPhone = document.querySelector('.v2-hero__phone')
  if (heroPhone.getClientRects().length) {
    assert(document.querySelector('.v2-hero__text').getBoundingClientRect().right + 16 <= heroPhone.getBoundingClientRect().left, 'Hero text must not overlap the phone')
  }
  const steps = [...document.querySelectorAll('.v4-stack-card')]
  assert(steps.length === 4, 'All four story steps must remain in the document')
  for (const step of steps) {
    const card = step.getBoundingClientRect()
    const copy = step.querySelector('.v4-stack-copy').getBoundingClientRect()
    const art = step.querySelector('.v4-stack-art').getBoundingClientRect()
    const visual = step.querySelector('.v4-stack-visual').getBoundingClientRect()
    assert(copy.top >= card.top && copy.bottom <= card.bottom && copy.right <= card.right, 'Step explanation must stay inside its card')
    assert(art.top >= visual.top - 1 && art.bottom <= visual.bottom + 1, 'Step illustration must fit its panel')
    if (innerWidth >= 540 && innerHeight >= 640) {
      assert(copy.right + 16 <= visual.left, 'Step text and illustration must stay separated')
      assert(step.offsetHeight + 212 <= innerHeight - 16, 'Every stacked card must fit beneath the headers')
    }
  }
  const placements = [...document.querySelectorAll('.v4-placement-choice')]
  assert(placements.length === 4 && placements.filter(button => button.getAttribute('aria-pressed') === 'true').length === 1, 'Exactly one placement must be selected')
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
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    assert(dots.every(dot => getComputedStyle(dot).animationName === 'none'), 'Map animation must respect reduced motion')
  } else {
    assert(dots.every(dot => getComputedStyle(dot).animationPlayState === (running ? 'running' : 'paused')), 'Dot playback must follow visibility and pause state')
  }
  return `PASS: V4 content, navigation and selection invariants at ${innerWidth}px`
}
