// Run with a browser's page.evaluate(assertLandingV4Layout) after loading /#/v4.
export function assertLandingV4Layout() {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  assert(location.hash === '#/v4', 'Expected V4 route')
  assert(document.querySelectorAll('main > section').length === 7, 'Seven content sections after removing the testimonial and bonus block')
  assert(document.documentElement.scrollWidth <= innerWidth, 'Horizontal overflow')
  assert(!document.querySelector('.v4-playback, .v4-pulse-toggle, .v4 .v2-hero__pause'), 'V4 playback controls must be removed')
  const header = document.querySelector('header')
  const brand = header.querySelector('a').getBoundingClientRect()
  const nav = header.querySelector('nav').getBoundingClientRect()
  assert(brand.right <= nav.left, 'Header controls overlap the brand')
  const steps = [...document.querySelectorAll('.v4-step-list button')]
  assert(steps.length === 4 && steps.filter(button => button.getAttribute('aria-pressed') === 'true').length === 1, 'Exactly one of four story steps must be selected')
  const placements = [...document.querySelectorAll('.v4-placement-choice')]
  assert(placements.length === 4 && placements.filter(button => button.getAttribute('aria-pressed') === 'true').length === 1, 'Exactly one placement must be selected')
  const phone = document.querySelector('#v4-placement-phone .app-shot-phone')
  const background = phone.querySelector('.app-shot-background')
  assert(background.complete && background.naturalWidth > 0 && background.getAttribute('src').includes('/app-clean/'), 'Sanitized app screenshot must load')
  const offer = phone.querySelector('.app-shot-offer').getBoundingClientRect()
  const frame = phone.getBoundingClientRect()
  assert(offer.left >= frame.left && offer.right <= frame.right && offer.bottom < frame.bottom, 'Offer must stay inside the phone')
  if (phone.querySelector('.app-shot-offer--main')) assert(offer.bottom <= frame.top + frame.height * .55, 'Main offer must not cover the SIM controls')
  assert(document.querySelectorAll('.v4 .v2-logo').length === 6, 'Six client logos without ticker duplicates')
  const art = document.querySelector('.v4-how-art').getBoundingClientRect()
  const status = document.querySelector('.v4-scene-status').getBoundingClientRect()
  assert(status.top >= art.bottom, 'Readiness status must sit below the illustration')
  const dots = [...document.querySelectorAll('.v4-pulse-dots circle')]
  assert(dots.length === 240, 'All audience positions can pulse')
  assert(new Set(dots.map(dot => dot.style.animationDuration)).size > 200, 'Dots must have independent pulse timings')
  const running = document.querySelector('.v2-sketch-metrics').dataset.pulsing === 'true'
  assert(dots.every(dot => getComputedStyle(dot).animationPlayState === (running ? 'running' : 'paused')), 'Dot playback must follow visibility and pause state')
  return `PASS: V4 content, navigation and selection invariants at ${innerWidth}px`
}
