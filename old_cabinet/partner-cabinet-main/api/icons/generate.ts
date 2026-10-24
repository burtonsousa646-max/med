import { generateOfferIcon } from '../../server/handlers.js'

export const config = { maxDuration: 60 }

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const dataUrl = await generateOfferIcon(req.body ?? {})
    res.status(200).json({ dataUrl })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' })
  }
}
