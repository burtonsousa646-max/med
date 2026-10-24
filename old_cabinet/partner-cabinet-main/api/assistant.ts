import { assistantReply, type ChatMessage } from '../server/handlers.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const messages = (req.body?.messages ?? []) as ChatMessage[]
    const reply = await assistantReply(messages, req.body?.page as string | undefined)
    res.status(200).json({ reply })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' })
  }
}
