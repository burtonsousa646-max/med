// Evaluate while the offer is generating; shared by the modal and page checks.
export function assertOfferGeneration() {
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const loader = document.querySelector('.offer-generation')
  assert(loader, 'Offer generation is visible')
  const canvas = loader.querySelector('canvas')
  assert(canvas?.width > 0 && canvas.height > 0, 'Dot field matches the creative size')
  assert(loader.getAttribute('aria-hidden') === 'true', 'Decorative progress does not duplicate the accessible status')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    assert(getComputedStyle(loader).display === 'none', 'Reduced motion shows the result directly')
  } else {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    assert(pixels.some((value, index) => index % 4 === 3 && value > 0), 'Dot field has rendered')
    const bounds = loader.getBoundingClientRect()
    const media = loader.parentElement.getBoundingClientRect()
    assert(bounds.width === media.width && bounds.height === media.height, 'Loader shares the final creative geometry')
    assert(getComputedStyle(loader).animationPlayState === (loader.dataset.paused === 'true' ? 'paused' : 'running'), 'Reveal follows the visibility pause')
  }
  const progress = Number.parseInt(loader.querySelector('.offer-generation-percent').textContent, 10)
  assert(progress >= 0 && progress <= 99, 'Demo progress waits for the completed result')
  return `PASS: offer generation at ${innerWidth}px (${progress}%)`
}
