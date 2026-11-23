// This dialog belongs to the Mac running the loopback demo. The browser never supplies a path.
import { execFile } from 'node:child_process'
import { open } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { promisify } from 'node:util'
import { packImage } from '../server/campaign-intake.ts'

const run = promisify(execFile)
const types = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.avif':'image/avif'}
const panel = `ObjC.import('AppKit')
function run() {
  const app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory)
  const dialog = $.NSOpenPanel.openPanel
  dialog.title = 'Изображение для постера'
  dialog.prompt = 'Выбрать'
  dialog.message = 'Выберите изображение для локального постера A4'
  dialog.allowedFileTypes = ['jpg','jpeg','png','webp','avif']
  dialog.allowsMultipleSelection = false
  dialog.canChooseDirectories = false
  app.activateIgnoringOtherApps(true)
  dialog.level = $.NSModalPanelWindowLevel
  return Number(dialog.runModal) === 1 ? ObjC.unwrap(dialog.URL.path) : ''
}`

let active = false
export function registerImagePicker(app, partnerSession) {
  app.post('/api/local-preview/poster-image', async c => {
    const origin = 'http://'+c.req.header('host')
    if (c.req.header('origin') !== origin || c.req.header('x-poster-picker') !== '1') return c.body(null,403)
    const session = await partnerSession(c)
    if (!session?.profile || session.role) return c.body(null,403)
    if (active) return c.json({message:'Окно выбора уже открыто на этом Mac.'},409)
    active = true
    try {
      const {stdout} = await run('/usr/bin/osascript',['-l','JavaScript','-e',panel],{
        timeout:180_000,signal:c.req.raw.signal,maxBuffer:16384,
      })
      const path = stdout.replace(/\n$/,'')
      if (!path) return c.body(null,204)
      const type = types[extname(path).toLowerCase()]
      if (!type) return c.json({message:'Выберите PNG, JPG, WebP или AVIF.'},422)
      const file = await open(path,'r')
      try {
        const stat = await file.stat()
        if (!stat.isFile() || !stat.size || stat.size>5*1024*1024) return c.json({message:'Выберите непустое изображение до 5 МБ.'},422)
        const buffer = Buffer.alloc(stat.size)
        const {bytesRead} = await file.read(buffer,0,buffer.length,0)
        if (bytesRead !== buffer.length) return c.json({message:'Файл изменился. Выберите его ещё раз.'},422)
        try { await packImage(new File([buffer],basename(path),{type})) }
        catch {return c.json({message:'Не удалось прочитать изображение. Выберите другой файл.'},422)}
        return c.body(buffer,200,{'Content-Type':type})
      } finally {await file.close()}
    } catch {
      return c.json({message:'Не удалось получить изображение из окна macOS. Попробуйте ещё раз.'},503)
    } finally {active=false}
  })
}
