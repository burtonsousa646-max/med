// Run in the browser on /#/mvp/new/promo after editing, returning or reloading.
export function assertMvpPromo(expectedCode) {
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const form = document.querySelector('form.mvp-promo')
  assert(form, 'Promo form is visible')
  assert(document.documentElement.scrollWidth <= innerWidth, 'No horizontal page overflow')
  for (const field of form.querySelectorAll('input')) {
    const box = field.getBoundingClientRect()
    assert(box.right <= innerWidth && box.left >= 0, 'Inputs fit the viewport')
  }
  if (expectedCode !== undefined) assert(form.querySelector('input').value === expectedCode, 'Promo code survives navigation and reload')
  const submit = form.querySelector('button[type="submit"]')
  const consent = form.querySelector('.mvp-go input[type="checkbox"]')
  assert(submit.textContent === 'отправить на проверку', 'Submission matches the next screen')
  assert(submit.disabled === (!consent.checked || !!form.querySelector('.is-error, input[type=file]:disabled')), 'Submission requires valid fields and consent')
  return 'MVP promo checks passed'
}
