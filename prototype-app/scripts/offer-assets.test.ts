import assert from 'node:assert/strict'
import { test } from 'node:test'
import { offerAssetError, offerCropRect } from '../shared/offer-assets.ts'

test('uploads reject unsupported, empty, large and undersized files', () => {
  assert.ok(offerAssetError('photo', 'image/svg+xml', 1000))
  for (const size of [0, 5 * 1024 * 1024 + 1]) assert.ok(offerAssetError('photo', 'image/png', size))
  assert.ok(offerAssetError('artwork', 'image/png', 1000, 1199, 600))
  assert.ok(offerAssetError('logo', 'image/png', 1000, 128, 127))
  assert.ok(offerAssetError('photo', 'image/png', 1000, 10000, 10000))
  assert.equal(offerAssetError('artwork', 'image/png', 5 * 1024 * 1024, 1200, 600), '')
})

test('cropping keeps the requested ratio and stays within the source at every edge', () => {
  assert.deepEqual(offerCropRect(1600, 1200, 2, 1, 50, 50), { x: 0, y: 200, width: 1600, height: 800 })
  for (const [width, height] of [[1600, 1200], [800, 1600]]) {
    for (const ratio of [1, 1.5, 2, width / height]) for (const zoom of [1, 3]) {
      for (const x of [0, 50, 100]) for (const y of [0, 50, 100]) {
        const crop = offerCropRect(width, height, ratio, zoom, x, y)
        assert.ok(crop.x >= 0 && crop.y >= 0)
        assert.ok(crop.x + crop.width <= width + 1e-9 && crop.y + crop.height <= height + 1e-9)
        assert.ok(Math.abs(crop.width / crop.height - ratio) < 1e-9)
      }
    }
  }
})
