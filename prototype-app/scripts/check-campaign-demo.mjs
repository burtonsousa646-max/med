// Evaluate in the browser after each settled wizard step.
export function assertCampaignDemo() {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const dialog = document.querySelector('dialog.campaign-demo[open]')
  assert(dialog, 'Demo wizard is open')
  assert(getComputedStyle(dialog).opacity === '1', 'Dialog is visible after the transition')
  const body = dialog.querySelector('.v3-dialog__body')
  assert(body.scrollWidth <= body.clientWidth + 1, 'No horizontal overflow in the form')
  assert(dialog.contains(document.activeElement), 'Focus stays inside the dialog')
  assert(dialog.querySelectorAll('.v3-progress li').length === 3, 'Three setup steps remain')
  const footer = dialog.querySelector('footer').getBoundingClientRect()
  assert(footer.bottom <= innerHeight && footer.top > 0, 'Next action remains visible')
  const completed = dialog.querySelector('.v3-complete')
  const editor = dialog.querySelector('.campaign-offer-editor')
  if (editor) {
    assert(editor.querySelectorAll('.v3-offer-card').length === 1, 'A single persistent offer canvas')
    const generating = editor.dataset.generating === 'true'
    const controls = editor.querySelector('.campaign-offer-controls')
    assert(controls.hasAttribute('inert') === generating, 'Editing is enabled only when the offer is ready')
    if (generating) {
      assert(dialog.querySelector('button[type="submit"]').disabled, 'Cannot advance during generation')
      assert(editor.querySelectorAll('.offer-reveal > span').length === 48, 'Image reveal stays inside the existing card')
      assert(editor.querySelector('.offer-canvas-status [role="status"]').textContent.trim(), 'Generation has a concise accessible status')
    }
  }
  if (completed) assert(completed.textContent.includes('оффер'), 'Offer reaches the summary')
  for (const field of dialog.querySelectorAll('input[aria-invalid="true"]')) {
    assert(document.getElementById(field.getAttribute('aria-describedby'))?.textContent.trim(), 'Invalid fields have associated feedback')
  }
  return `PASS: campaign demo layout and focus at ${innerWidth}px`
}
