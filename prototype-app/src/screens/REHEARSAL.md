# HowGraphics — interface realism pass

Reference: the user's V2 creative-editor screenshot. Stageshow dark-bento supplied the cropped surface and foreground payoff framing; its source was copied to `/tmp/med-how-ui/gold-reference.tsx` for comparison. The implementation uses the actual V2 `Creative`, `ReachMap`, `Chip`, input/window styles and `MovingLabel` inside the vendored Stage, instead of the example's music UI.

Four once-in-view mini scenes show business/point confirmation, creative validation, audience selection, and confirmed visits. Timed transitions run from phase 0 to 1 at 800 ms and to 2 at 2300 ms; completion remains visible. Reduced motion shows the final poster. Illustrations are inert and hidden from the accessibility tree; the page's headings and CTA supply navigation. These are authored demos, not live lookups, moderation or visit attribution.

Production build and Chrome checks passed at 320/390/768/1440 px: four Stage instances, final posters, CTA, no document overflow/JS errors. Normal-motion checks cover ordered transitions and retained completion after scrolling away/back.

Ran unmodified `film.mjs --gate` on all four scenes at 1440 and 390 px against the source server. Both final recordings ended “rehearsal passed” with zero layout/framing findings. Sampling remains inconclusive: three gaps above 27 ms on desktop (max 30.7 ms), four on mobile (max 37.5 ms). Contact sheets were reviewed, including SVG map/dot drawing changes flagged for manual review. This is not a complete frame-rate or browser certification. Safari and physical touch hardware were not tested.

Evidence: `/tmp/med-how-ui/film-{wide,mobile}-final.{png,json}` and session visualization folder `landing-v3-interface-scenes`.

---

# Landing V3 motion rehearsal — 2026-11-06

Destination: `http://127.0.0.1:5173/#/v3` (production build). Source rehearsal server: port 5174, used only during development.

## Direction and implementation

The hero tells one nine-second story: a local business creates an offer, reaches a neighbour, and welcomes a guest. It ends at a stable poster. Pause/resume and replay are explicit controls. Visibility suspends playback without changing user intent. Reduced motion displays the complete poster.

Stageshow's phone-touch reference supplies the continuity principle: keep the focal object mounted. `PlacementPhone` keeps both the Phone and offer DOM nodes while a shared spring changes offer position and image height; contextual content crossfades. The actual Stage/Phone kit sources and license are vendored, with no new npm dependency.

Dialog scenes exit before entry; synchronous navigation locks prevent double-click skips. Closing interrupts any scene transition, restores trigger focus and preserves the current draft. Audience chips, summaries, uploads and the example-filled button use smaller transitions. Active text entry is not animated.

## Verification

- TypeScript and Vite production build passed.
- Full production flow passed at 320, 390 and 1440 px: validation, addresses, uploads, preview, back navigation, targeting, completion, reopening and focus restoration. No document overflow, failed requests or browser errors in those scenarios.
- Motion stress checks passed at those widths: six quick placement switches, preserved device/card identity, fixed device position across 83–84 sampled frames, triple-click navigation, close during a transition, draft retention, Tab containment and Escape.
- Pause/resume and reduced-motion poster/form behavior passed. Completed-story replay is checked separately against the production build.
- Inspected desktop/mobile contact sheets, phone resting states and offer dialog screenshots. The mobile composition was adjusted to separate the coupon and final confirmation.

## Stageshow film gate

Ran the unmodified `film.mjs --gate` against the real hero Stage at desktop and mobile widths. The source server preserves `/kit/` stylesheet provenance, which the detector cannot recognize in Vite's bundled production CSS.

The final mobile capture covered 653 frames over 10.86 seconds, with an 18.4 ms maximum gap: complete sampling and no gate-blocking findings. The desktop capture had no gate-blocking findings but sampling was inconclusive (six gaps, maximum 50.3 ms). This is not a blanket performance certification.

Remaining advisory findings concern axis-aligned bounds around the rotated photograph caption (roughly 10–14 px measured against 17 px CSS padding). The caption's actual visual padding was reviewed in the contact sheets. SVG map, route and check drawing changes are explicitly listed for manual review by the detector; inspected opening, busy middle and final frames.

Temporary evidence: `/tmp/med-v3-motion/hero-mobile-final.{png,json}`, `hero-wide-final.{png,json}`, `stress-*-phone.png`, `stress-*-offer.png`, and the production flow captures. Reviewed exports are also saved in the session's visualization directory.

## Limits

Checks used local Chrome, not Safari or physical touch hardware. No real microphone test or backend campaign submission was performed. Draft data remains component state and resets on page reload. No third-party plugin or remote service is required for playback.

## Business setup follow-up

The business form now starts with INN + phone, then confirms profile and campaign locations. Current functional verification is documented in `../../docs/landing-v3-design.md`. The original map/address-picker scenario above describes the earlier form; the current flow uses explicit address entry and optional addition of the registry address. Inline validation, lookup cancellation, manual recovery, online businesses and contextual offers were exercised at 320, 390 and 1440 px. Stable visual captures are in the session visualization directory under `landing-v3-business`. Live provider access remains unverified without DADATA_API_KEY.
