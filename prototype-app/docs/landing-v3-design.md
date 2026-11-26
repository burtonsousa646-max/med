# Current direction — realistic product UI

The user clarified that realism means V2-style interface graphics, not photographs. The four how-it-works scenes now show native product surfaces: a business field/map, the real green Creative in a selection frame, audience chips, and a visit confirmation/result. Photographic scenes are no longer rendered. Original generated files remain preserved.

The card sequence and copy remain intact. Motion uses two finite phase changes, crossfading labels and completion indicators, with static reduced-motion posters. See `src/screens/REHEARSAL.md` for gate results and coverage limits. Earlier notes below record previous iterations.

---

# Photorealistic how-it-works series

The current four scenes use generated editorial photographs instead of the earlier SVG illustrations. Built-in ImageGen produced a matching cafe/offer/audience/guests series; these are synthetic scenes, not documentary customer photographs. Final responsive JPEGs are in `public/img/how-real-v1`; source PNGs and exact generation prompts are in `output/imagegen/how-real-v1`. `HowGraphics.tsx` keeps the four-scene API and uses native responsive images, lazy loading, fixed 4:3 frames, descriptive alt text and a subtle once-in-view scale settle. The full frame is preserved at all breakpoints.

TypeScript/Vite and Chrome checks passed at 320, 375, 768 and 1440 px: four decoded images, correct aspect ratio, no horizontal overflow, modal CTA and settled motion. Safari was not checked. Earlier notes below describe previous visual iterations.

---

# How-it-works graphics

The four V3 setup illustrations now share authored SVG artwork: an isometric shop on a layered map, a paper coupon with the existing transparent coffee asset, illustrated customer portraits with selected matches, and happy guests sharing coffee at a cafe table. The fourth step completes the story with a visit. The grid is four columns at 1440 px and above, two columns on tablets and smaller desktops, and one on phones. `HowGraphics.tsx` contains the scenes; `how-graphics.css` sets their type. Each scene has a short once-in-view entrance; reduced motion shows its final state. Copy, step order and CTA are retained. No new image service or npm dependency.

Build and Chrome checks passed at 320/375/768/1440 px: four graphics, retained setup headings plus the new guest step, modal CTA, no overflow/JS errors. Tablet header now uses the existing compact menu to avoid overflowing when its sticky CTA appears. Safari and physical devices were not tested.

---

# Compact metrics refinement

The V3 metrics now use V2's dark surface and yellow highlights in one compact section: a short heading, a crowd of dots with a once-only 2.5-second scan/selection animation, and three aligned figures (15 млн / 200 / 15%). Existing Num reveals the values once. The scan starts when 65% of the section is visible, highlights matching points in sequence and settles. Reduced motion immediately shows final values and selected dots without the scan. Chrome checks at 375/1440 px cover sequencing, final state, once-only playback and reduced motion. No nested statistic cards or extra CTA. Checked Chrome at 320, 375, 768 and 1440 px: 283–325 px section height, aligned values, no text or document overflow; animated numbers settle correctly. Original V2 Audience is unchanged. Metric accuracy was not revalidated.

---

# Content update from the wireframe — 2026-11-08

Current V3 uses the V2 visual system with the wireframe's content order: hero, three metrics (15 млн / 200 / 15%), three setup steps, six client brands, placements, three existing cases, existing quote/bonus, final CTA. Navigation points to the new sections. Metrics are supplied prototype copy, not independently verified figures.

Hero changes are text-only: “Находите новых клиентов”, the wireframe's description, and “запустить сейчас”. Its markup, video, offer preview, phone, classes and layout styles are retained. V2/MVP keep their prior content and login behavior. V3 CTAs continue opening the same CampaignWizard.

Verified production build and Chrome at 320, 375 and 1440 px: section order, text, six logos, preserved hero assets, four modal entry points, no document overflow, and original V2 hero/pricing/FAQ/login behavior.

---

# V3 — preserve V2 (2026-11-08)

V2 is the visual authority. V3 renders the same `LandingV2` component with an optional campaign-start callback; V2 and MVP keep their existing login links. V3 campaign CTAs open the existing `CampaignWizard`. The dialog uses the shared V2 palette, rounded buttons, grey input surfaces and pastel panels through `v3-v2-theme.css`.

INN/phone collection, business lookup, point confirmation, offer creation, validation and accessible modal transitions are retained. The separate editorial V3 landing is removed from the route. The notes below record the earlier concept and implementation history, not the current visual direction.

Verified at 320, 390 and 1440 px: matching V2/V3 hero geometry, typography and colors; V2 login links; V3 modal opening/closing; manual business setup, contextual offer and clearing stale data when INN changes. Production build passed. Live DaData lookup was not rechecked.

---

# Landing V3 — editorial direction

## Intent

A local business meets the people nearby. Preserve the wireframe's order and put all campaign configuration in one three-step dialog. The visual thread is the neighbourhood, a breakfast offer, and an interested customer.

## Visual system

- Warm paper `#faf9f6`, ink `#20201d`, yellow `#ffce32`, muted text `#706f67`.
- Existing BeelineSans Regular; display sizes scale by viewport, without artificial bold fonts.
- Shared page/composer tokens are scoped to `.v3` and `.v3-dialog`.
- Photography leads the hero and cases. Geographic illustrations and paper offers explain the setup. `PlacementPhone` uses Stageshow's Phone frame and the existing Creative system.
- Stageshow's Stage and a narrow set of MIT-licensed kit sources live in `src/vendor/stageshow`. The phone-touch reference informed continuity: the same offer stays mounted while its position and image proportions change.

## Motion rehearsal

- A nine-second hero story connects business, offer and new guest, with pause, resume and replay. Playback suspends outside the viewport and when the document is hidden.
- Sections reveal on first approach. Placement changes retarget the same spring, preserving the phone's position. Dialog steps use directional exit/entry, a moving progress indicator and explicit interruption handling. No perpetual autoplay loops.
- Audience selection, generated example feedback, upload confirmation and offer preview updates have coordinated transitions. See `src/screens/REHEARSAL.md` for motion checks and their limits.
- Reduced motion shows complete hero art and paths immediately, with CSS transitions and dialog entrance disabled.
- Checked normal-motion frames at 1440 and 390 px, plus the full interactive scenario at 320, 390 and 1440 px. Fixed a transient ticket overflow at 320 px.
- Checked static layouts at 320, 390, 768 and 1440 px. No document overflow or failed asset requests.
- Checked required-field validation, confirmed address entry, uploaded image/logo previews, data retention on back/reopen, targeting, and draft completion.
- Checked Tab containment, Escape dismissal and focus restoration; completed steps support direct backward navigation.
- TypeScript and Vite production build passed.

## Scope

Campaigns remain in local component state until reload. Figures, campaign results, customer examples and terms are illustrative. No campaign API submission or production publication was introduced. Business lookup uses the server-side DaData adapter when DADATA_API_KEY is configured; without it the UI offers retry/manual entry. No new npm dependencies or external skill installation was introduced. Voice recognition was not exercised with a real microphone in this design pass. Browser checks used local Chrome; Safari and real touch hardware were not tested.

## Business onboarding refinement

The first screen contains only INN and contact phone (website removed at the user's request). Lookup leads to editable business details and explicit point selection within step 01. Registry addresses are suggestions, not campaign points. Online businesses can skip addresses. Offers use confirmed name/category; discounts and promo codes remain explicit user inputs. No external website scraping or AI copy generation is claimed.

Checks include INN control digits (10/12 digits), Russian contact phone format, required business/address fields, duplicate points, offer title, promo characters, integer discount 1–99, non-past expiry, file type/5 MB limit and actual image decoding. Inline errors are linked to fields, announced after blur/submission, and the first invalid field gets focus. Form transitions, loading/cancel feedback and success indicators respect reduced motion.

All 10 API tests and TypeScript/Vite build passed. Browser scenarios passed at 320/390/1440 px with fixture provider responses, real unconfigured-provider recovery, manual/online paths, cancellation and stale-response protection. A live DaData request was not tested: no key is configured.
