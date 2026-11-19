export class PreviewInbox {
  readonly addresses = ['partner@example.test','staff@example.test']
  private messages = new Map<string,{email:string; code:string; expires:number}>()

  deliver(email:string, code:string, id:string) {
    const now = Date.now()
    for (const [key,message] of this.messages) if (message.expires <= now) this.messages.delete(key)
    if (!this.addresses.includes(email)) throw new Error('Unknown preview recipient')
    this.messages.set(id,{email,code,expires:now+600_000})
  }

  forget(id:string) { this.messages.delete(id) }

  text(id:string|null) {
    const messages = id ? [this.messages.get(id)] : [...this.messages.values()].reverse()
    return this.addresses.map(email => {
      const message = messages.find(m=>m && m.email===email && m.expires>Date.now())
      return email+' — '+(message?.code ?? 'Запросите код в кабинете')
    }).join('\n')
  }
}
