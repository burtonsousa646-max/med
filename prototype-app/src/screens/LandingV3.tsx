import { useState } from 'react'
import LandingV2 from './LandingV2'
import CampaignWizard from './CampaignWizard'
import './landing-v3.css'
import './landing-motion.css'
import './v3-v2-theme.css'

export default function LandingV3() {
  const [wizardOpen, setWizardOpen] = useState(false)
  return <div className="v3-v2-theme">
    <LandingV2 onStart={() => setWizardOpen(true)} />
    <CampaignWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
  </div>
}
