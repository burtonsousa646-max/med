import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { link, mkdir, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { bodyLimit } from 'hono/body-limit'
import { createPosterPdf } from '../shared/poster-pdf.ts'

const run = promisify(execFile)

async function savePoster(folder,bytes,name) {
  await mkdir(folder,{recursive:true})
  const temp = join(folder,'.'+randomUUID()+'.tmp')
  try {
    await writeFile(temp,bytes,{flag:'wx',mode:0o600})
    for (let copy=1;;copy++) {
      const fileName = copy === 1 ? name : name.slice(0,-4)+' ('+copy+').pdf'
      try {
        await link(temp,join(folder,fileName))
        return fileName
      } catch (error) { if (error.code !== 'EEXIST') throw error }
    }
  } finally { await unlink(temp).catch(()=>{}) }
}

export function registerPosterDownloads(app,partnerSession,folder = join(homedir(),'Downloads','Постеры партнёра')) {
  app.use('/api/local-preview/posters/*',async (c,next)=>{
    if (c.req.header('origin') !== 'http://'+c.req.header('host') || c.req.header('x-poster-export') !== '1') return c.body(null,403)
    const session = await partnerSession(c)
    if (!session?.profile || session.role) return c.body(null,403)
    await next()
  })
  app.post('/api/local-preview/posters',bodyLimit({maxSize:24*1024*1024,
    onError:c=>c.json({message:'Файл постера слишком большой.'},413)}),async c=>{
    const form = await c.req.formData().catch(()=>null)
    const name = form?.get('name'), title = form?.get('title'), image = form?.get('image')
    if (typeof name !== 'string' || Buffer.byteLength(name)>220 || !/^[\p{L}\p{N} —-]+\.pdf$/u.test(name) ||
        typeof title !== 'string' || title.length>512 || !(image instanceof File) || image.type !== 'image/jpeg') {
      return c.json({message:'Не удалось прочитать данные постера.'},422)
    }
    let bytes
    try { bytes = await createPosterPdf(await image.arrayBuffer(),title) }
    catch { return c.json({message:'Не удалось подготовить PDF формата A4.'},422) }
    try { return c.json({name:await savePoster(folder,bytes,name)},201) }
    catch { return c.json({message:'Не удалось сохранить PDF. Проверьте доступ к папке «Загрузки» и свободное место.'},500) }
  })
  app.post('/api/local-preview/posters/folder',async c=>{
    try { await run('/usr/bin/open',[folder]); return c.body(null,204) }
    catch { return c.json({message:'Не удалось открыть папку. Она находится в Finder → Загрузки → Постеры партнёра.'},500) }
  })
}
