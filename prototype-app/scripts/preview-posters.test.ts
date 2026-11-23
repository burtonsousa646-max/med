import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'

process.env.DB_PATH = ':memory:'
const { registerImagePicker } = await import('./preview-image-picker.mjs')
const { registerPosterDownloads } = await import('./preview-poster-downloads.mjs')
const { app: production } = await import('../server/index.ts')
const host = '127.0.0.1:5184'
const headers = {host, origin:'http://'+host, 'X-Poster-Export':'1', 'X-Poster-Picker':'1'}

test('native poster controls are absent from the production API and require a same-origin partner session in preview', async () => {
  const preview = new Hono()
  let account: {profile:object|null; role?:string}|null = null
  registerImagePicker(preview,async()=>account)
  registerPosterDownloads(preview,async()=>account)
  for (const path of ['/api/local-preview/poster-image','/api/local-preview/posters','/api/local-preview/posters/folder']) {
    assert.equal((await production.request(path,{method:'POST',headers})).status,404)
    for (const identity of [null,{profile:null},{profile:{},role:'staff'}]) {
      account=identity
      assert.equal((await preview.request(path,{method:'POST',headers})).status,403)
    }
    account={profile:{}}
    for (const denied of [{...headers,origin:'https://example.test'},{host,origin:headers.origin}]) {
      assert.equal((await preview.request(path,{method:'POST',headers:denied})).status,403)
    }
  }
})

test('local PDF export rejects invalid names, non-images and oversized requests',async()=>{
  const preview = new Hono()
  registerPosterDownloads(preview,async()=>({profile:{}}))
  for (const name of ['папка/постер.pdf','постер.txt','постер.pdf']) {
    const form = new FormData()
    form.set('name',name)
    form.set('title','Постер')
    form.set('image',new Blob(['тест'],{type:'image/jpeg'}),'photo.jpg')
    const response = await preview.request('/api/local-preview/posters',{method:'POST',headers,body:form})
    assert.equal(response.status,422)
    assert.match((await response.json()).message,name==='постер.pdf' ? /подготовить PDF/ : /данные постера/)
  }
  const oversized = await preview.request('/api/local-preview/posters',{method:'POST',
    headers:{...headers,'Content-Length':String(25*1024*1024)},body:'x'})
  assert.equal(oversized.status,413)
})
