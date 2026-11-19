// Keep previously shared prototype URLs usable when opening a bookmark or following a hash link.
export function legacyPath(path: string) {
  return path.replace(/^\/mvp\/new\/promo(?=[/?]|$)/,'/app/campaigns/new')
    .replace(/^\/mvp\/done(?=[/?]|$)/,'/app/campaigns')
    .replace(/^\/mvp\/new(?=[/?]|$)/,'/app/campaigns/formats')
    .replace(/^\/mvp\/login\/?(?=[?]|$)/,'/app/')
    .replace(/^\/v4\/staff(?=[/?]|$)/,'/app/staff')
    .replace(/^\/near\/?(?=[?]|$)/,'/market/')
}

export function migratePrototypeUrl() {
  const hashPath = location.hash.slice(1)
  if (hashPath && !/^\/[a-z0-9]/i.test(hashPath) && hashPath !== '/') return
  const source = new URL(location.href)
  if (hashPath) {
    const legacy = new URL(hashPath, source.origin)
    if (legacy.origin !== source.origin) return
    source.pathname = legacy.pathname
    legacy.searchParams.forEach((value,key) => source.searchParams.set(key,value))
    source.hash = ''
  }
  source.pathname = legacyPath(source.pathname)
  if (source.href !== location.href) history.replaceState(history.state,'',source)
}
