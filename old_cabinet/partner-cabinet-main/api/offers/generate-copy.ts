import { generateOfferCopy, type OfferCopyInput } from '../../server/handlers.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const input = req.body as OfferCopyInput
    const result = await generateOfferCopy(input)
    res.status(200).json(result)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' })
  }
}
