// Evaluate in the browser after each settled wizard step.
export function assertCampaignDemo() {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const dialog = document.querySelector('dialog.campaign-demo[open], main.campaign-page')
  assert(dialog, 'Campaign flow is visible')
  assert(getComputedStyle(dialog).opacity === '1', 'Dialog is visible after the transition')
  const body = dialog.querySelector('.v3-dialog__body')
  assert(body.scrollWidth <= body.clientWidth + 1, 'No horizontal overflow in the form')
  assert(dialog.contains(document.activeElement), 'Focus stays inside the dialog')
  if (dialog.matches('main')) assert(!document.querySelector('dialog[open]'), 'Page flow has no modal dialog')
  assert(dialog.querySelectorAll('.v3-progress li').length === 3, 'Three setup steps remain')
  const footer = dialog.querySelector('footer').getBoundingClientRect()
  assert(footer.bottom <= innerHeight && footer.top > 0, 'Next action remains visible')
  const completed = dialog.querySelector('.v3-complete')
  const editor = dialog.querySelector('.campaign-offer-editor')
  if (editor) {
    assert(editor.querySelectorAll('.v3-offer-card').length === 1, 'A single persistent offer canvas')
    assert(editor.querySelectorAll('.offer-workspace [role=toolbar] button').length === 2, 'Another design and undo are the only toolbar actions')
    assert(editor.querySelector('.offer-assistant textarea'), 'The assistant has a direct input')
    assert(editor.querySelectorAll('.offer-assistant-examples button').length === 2, 'Only two suggested edits remain')
    assert(editor.querySelector('.v3-offer-card .campaign-creative'), 'Offer details are inside the creative')
    assert(editor.querySelectorAll('.offer-edit-actions button').length === 3, 'Text, media and terms have clear entry points')
    assert(editor.querySelectorAll('.offer-edit-panel:not([hidden])').length <= 1, 'Only the chosen editor section is visible')
    const generating = editor.dataset.generating === 'true'
    const controls = editor.querySelector('.campaign-offer-controls')
    assert(controls.hasAttribute('inert') === generating, 'Editing is enabled only when the offer is ready')
    if (generating) {
      assert(dialog.querySelector('button[type="submit"]').disabled, 'Cannot advance during generation')
      assert(editor.querySelector('.offer-generation canvas'), 'Dot generation stays inside the existing card')
      assert(editor.querySelector('.offer-canvas-status [role="status"]').textContent.trim(), 'Generation has a concise accessible status')
    }
  }
  if (completed) {
    assert(completed.textContent.includes('оффер'), 'Offer reaches the success screen')
    assert(completed.querySelector('.campaign-summary-creative'), 'Success shows the configured creative')
    assert(dialog.querySelectorAll('.v3-progress li.is-done').length === 3, 'All three steps are complete')
    if (dialog.matches('main')) assert(location.hash.endsWith('/success'), 'Audience leads straight to success')
  }
  const audience = dialog.querySelector('.campaign-audience-layout')
  if (audience) {
    assert(audience.querySelectorAll('.audience-geography input:checked').length === 1, 'One geography is selected')
    assert(audience.querySelectorAll('.audience-moment input:checked').length === 1, 'One moment is selected')
    assert(audience.querySelector('.audience-summary dd')?.textContent.trim(), 'The targeting summary is visible')
  }
  for (const creative of dialog.querySelectorAll('.campaign-creative__layout')) {
    const copy = creative.querySelector('.campaign-creative__copy').getBoundingClientRect()
    const terms = creative.querySelector('.campaign-creative__terms').getBoundingClientRect()
    assert(copy.bottom <= terms.top + 1, 'Offer text stays above the terms')
    const media = creative.querySelector('.campaign-creative__media')?.getBoundingClientRect()
    if (creative.dataset.layout === 'split') assert(copy.right <= media.left + 1, 'Photo has its own area')
    if (creative.dataset.layout === 'photo') assert(media.bottom <= copy.top + 1, 'Photo sits above the copy')
  }
  for (const field of dialog.querySelectorAll('input[aria-invalid="true"]')) {
    assert(document.getElementById(field.getAttribute('aria-describedby'))?.textContent.trim(), 'Invalid fields have associated feedback')
  }
  return `PASS: campaign demo layout and focus at ${innerWidth}px`
}

// Run after closing an invalid manual field and attempting to continue.
export function assertCampaignValidation() {
  const field = document.querySelector('.offer-edit-panel input[aria-invalid="true"]')
  if (!field || field.closest('.offer-edit-panel').hidden || document.activeElement !== field) throw new Error('Reveal and focus the invalid manual field')
  return 'PASS: invalid manual field is revealed and focused'
}
