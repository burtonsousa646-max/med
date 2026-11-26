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
  const stepCount = dialog.matches('main') ? 5 : 3
  assert(dialog.querySelectorAll('.v3-progress li').length === stepCount, 'Campaign progress reflects the number of steps')
  for (const button of dialog.querySelectorAll('main.campaign-page .v3-progress button')) {
    const badge = button.querySelector('.v3-progress__number').getBoundingClientRect()
    const icon = button.querySelector('svg').getBoundingClientRect()
    const target = button.getBoundingClientRect()
    assert(Math.abs(badge.left + badge.width / 2 - icon.left - icon.width / 2) < 1, 'Step icon is centered horizontally')
    assert(Math.abs(badge.top + badge.height / 2 - icon.top - icon.height / 2) < 1, 'Step icon is centered vertically')
    assert(target.width >= 44 && target.height >= 44, 'Step has a full touch target')
  }
  const footer = dialog.querySelector('footer').getBoundingClientRect()
  assert(footer.bottom <= innerHeight && footer.top > 0, 'Next action remains visible')
  const completed = dialog.querySelector('.v3-complete')
  const editor = dialog.querySelector('.campaign-offer-editor')
  if (editor) {
    assert(editor.querySelectorAll('.v3-offer-card').length === 1, 'A single persistent offer canvas')
    assert(editor.querySelectorAll('.offer-workspace [role=toolbar] button').length === 2, 'Another design and undo are the only toolbar actions')
    const artwork = dialog.querySelector('.offer-source-switch button:nth-child(2)')?.getAttribute('aria-pressed') === 'true'
    if (!artwork) {
      assert(editor.querySelector('.offer-assistant textarea'), 'The assistant has a direct input')
      assert(editor.querySelectorAll('.offer-assistant-examples button').length === 2, 'Only two suggested edits remain')
      assert(!editor.querySelector('.offer-layout-picker'), 'The current editor keeps one layout')
      assert(editor.querySelector('.offer-assistant-disclosure'), 'AI controls have a separate clear entry point')
      assert(editor.querySelector('.v3-offer-card textarea'), 'The offer text is editable directly on the canvas')
    }
    assert(editor.querySelector('.v3-offer-card .campaign-creative, .offer-artwork-empty'), 'Canvas shows the offer or an upload prompt')
    assert(editor.querySelectorAll('.offer-surface-tabs button').length === 4, 'All four surfaces have a live preview')
    assert(editor.querySelectorAll('.offer-edit-actions button').length === 3, 'Text, media and terms have clear entry points')
    assert(editor.querySelectorAll('.offer-edit-panel:not([hidden])').length <= 1, 'Only the chosen editor section is visible')
    const generating = editor.dataset.generating === 'true'
    const controls = editor.querySelector('.campaign-offer-controls')
    assert(controls.hasAttribute('inert') === generating, 'Editing is enabled only when the offer is ready')
    if (generating) {
      const next = dialog.querySelector('button[type="submit"]')
      if (dialog.matches('main')) assert(!next.disabled && next.textContent.includes('Продолжить с черновиком'), 'V4 offers an immediate draft in the primary action')
      else assert(next.disabled, 'Dialog cannot advance during generation')
      assert(editor.querySelector('.offer-generation canvas'), 'Dot generation stays inside the existing card')
      assert(editor.querySelector('.offer-canvas-status [role="status"]').textContent.trim(), 'Generation has a concise accessible status')
    }
  }
  if (completed) {
    assert(completed.textContent.includes('оффер'), 'Offer reaches the success screen')
    assert(completed.querySelector('.campaign-summary-creative'), 'Success shows the configured creative')
    assert(dialog.querySelectorAll('.v3-progress li.is-done').length === stepCount, 'All steps are complete')
    if (dialog.matches('main')) {
      assert(location.hash.endsWith('/success'), 'Confirmed email leads to success')
      assert(completed.querySelector('h3').textContent.trim() === 'Заявка принята', 'V4 confirms that the request was accepted')
    }
  }
  const audience = dialog.querySelector('.campaign-audience-layout')
  if (audience) {
    assert(audience.querySelectorAll('.audience-geography input:checked').length === 1, 'One geography is selected')
    assert(audience.querySelectorAll('.audience-moment input:checked').length === 1, 'One moment is selected')
    assert(audience.querySelector('.audience-summary dd')?.textContent.trim(), 'The targeting summary is visible')
  }
  for (const creative of dialog.querySelectorAll('.campaign-creative__layout')) {
    if (creative.dataset.layout === 'artwork') {
      const media = creative.querySelector('.campaign-creative__media')
      assert(getComputedStyle(media.querySelector('img')).objectFit === 'contain', 'Uploaded artwork is shown without cropping')
      continue
    }
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
