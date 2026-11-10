# Landing V4

V4 is the default page at `/` and is also available at `/#/v4`. Earlier landings are at `/#/v1`, `/#/v2` and `/#/v3`.

V4 has five visible content sections; the client logos and case studies are temporarily commented out, and the testimonial and bonus section was removed at the user's request. V4 follows one coffee campaign through business setup, creative, audience, placement and a final preview. Demonstration art consistently uses the existing «Зерно / −20% на первую покупку» creative. Demonstration data never enters the campaign form.

The how-it-works section has four scroll-stacking cards, inspired by the user's 21st.dev Stacking Cards reference. At widths of at least 900px and heights of at least 720px, native sticky positioning layers each new card over the previous ones, and Motion slightly scales the covered cards with page-scroll progress. The section heading and launch action stay above the cards. There is no nested scroll area or wheel interception. Cards use restrained white, light grey and graphite surfaces, with small yellow accents and the existing purple offer. Each step keeps its full explanation and completed product illustration; the previous timed carousel is removed. On smaller windows and with reduced motion, all four cards appear in normal document flow. Placements remain manually selected beside a stable phone.

Metrics show their final values immediately. V4 styling is scoped under `.v4`; the existing campaign wizard and design-system components are reused. Shared sections expose optional calm presentation with original behavior as default.

## Responsive layout

The hero shares the page grid and aligns with the header and other sections. Desktop hero height is capped at 760 px
and adapts to short windows. Below 900 px the launch action and ad preview flow
in one column. The muted hero video loops with a playback control and stays on its poster when reduced motion is enabled.

Metrics, placements and the final section size to their contents. The metrics
map is in the grid beside the heading or below it, and the figures stack into
rows on narrow screens. The placement controls switch between a side column and
a compact grid. On mobile the launch action follows the placement preview.
The header launch action remains visible on mobile and opens the same V4 campaign setup as the hero.

The step cards stack on scroll only when the window has room and reduced motion
is off. On smaller windows the cards flow in order. In the campaign form, the
footer buttons scroll with the form when the window is short, keeping focused
fields clear of the footer.

## Verification

### Audience map

V4 replaces the regular dot grid with a dark vector map of central Moscow. The basemap uses actual OpenStreetMap road, water and park geometry, projected together with the points in Web Mercator, north up. Bounds: south 55.68, west 37.48, north 55.82, east 37.78. OSM snapshot: 2026-11-08T21:21:00Z, retrieved through `https://ovp.dresel.systems/api/interpreter`.

The 240 audience points are illustrative, deterministically sampled from OSM building centres. They are not subscriber records, a measured density or coverage data. Generation excludes water polygons and crowded point pairs. The accessible description identifies this as a demonstration. Visible captions under the map are removed at the user's request. The independent pulses loop while the map is visible and the tab is active. A control pauses the motion. Reduced motion shows static points.

`scripts/moscow-map.overpassql` reproduces the source query. Save its Overpass JSON response, then run `python3 scripts/build-audience-map.py /path/to/moscow-osm.json`. The script produces `public/img/moscow-audience-map.svg` and `src/screens/moscow-audience.json`; geographic-layer and point-placement assertions run during generation. The local SVG is 981 KB before compression, about 293 KB gzipped. No map SDK, API key or third-party map requests are needed at runtime.

Map data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. The attribution link is in the page footer. The original dot-grid presentation remains on the other landing variants.

### Landing checks

- TypeScript and Vite production build passed.
- Chromium layout checks covered 22 viewport sizes from 320 × 256 to 3440 × 1440, with and without reduced motion.
- Browser assertions in `scripts/check-landing-v4.mjs` cover reflow, CTA visibility, hero and map geometry, the sticky card fallback and placement controls.
- Scroll stacking is reversible, and the next section remains reachable with normal page scrolling.
- Placement switching, stable phone and visible campaign creative checked.
- The how-it-works CTA opens the existing V4 campaign page at `/#/v4/create`.
- V3 regression check retained eight sections and its original four-card setup layout.
- No browser console errors observed.

Not checked: real mobile hardware, Safari, OS reduced-motion runtime or real campaign submission. The existing wizard creates a local draft; this pass adds no campaign publishing API. Existing metrics, customer examples and bonus claims were retained, not independently verified.

## Campaign wizard demo

Campaign setup calls the Autocomplete service after entry of a valid INN. DaData fills editable business details when the user confirms the result. The registered address is offered as a possible location. V4 restores its draft and images from IndexedDB.

The first step is compact, with a real creative preview, inline validation and focus feedback. Offer discount and the suggested title stay synchronized; custom titles are preserved. The final summary includes discount, promo code and date. Browser checks covered the complete demo, back navigation, errors, cancellation, dynamic preview and 320/375/1280 px layout. Reusable assertions: `scripts/check-campaign-demo.mjs`. File upload and local speech recognition were not exercised in this pass.

### Сборка и правки оффера

На втором шаге генерация и редактирование находятся на одном экране. Постоянная карточка проявляется из размытой поверхности примерно за 30 секунд; короткие статусы размещены под ней. Нет отдельной сцены и списка этапов. Размер и положение карточки сохраняются при завершении. Инструменты правки мягко появляются рядом, без смены экрана. Проявление можно пропустить или повторить без изменения данных. При reduced motion показ сокращается; при скрытой вкладке таймер и эффект приостанавливаются.

В редакторе креатив находится в фиолетовой рамке с действиями «собрать заново» и «редактировать». Ручные поля раскрываются внутри рамки; повторный вход под чатом удалён. Автосохранение подтверждается тихим статусом после записи в IndexedDB. Рядом расположен компактный чат «Что изменить?» с двумя подсказками и голосовым вводом; история появляется после первого сообщения. Начальный фон фиолетовый, скидка крупная жёлтая, чашка увеличена; старый зелёный черновик при открытии получает фиолетовый фон. Демо поддерживает цвет фона, скидку, предложение «1 + 1», размер чашки, промокод и заголовок в кавычках. Правка сопровождается анимацией карточки, результат можно отменить. Ручная правка сбрасывает старую отмену, чтобы не потерять новые данные. Ручные поля доступны через «редактировать» в рамке оффера; при ошибке в скрытом поле раздел автоматически раскрывается.

Голосовая кнопка использует SpeechRecognition браузера, показывает распознанный текст и требует нажатия стрелки для применения. При отсутствии API или ошибке микрофона остаются текст и примеры. Реального генеративного API нет. Распознавание речи может использовать сервис браузера. Данные кампании не отправляются в бэкенд.

Применён landing-page-design: визуальный приоритет креатива, компактная иерархия, явные состояния управления, адаптивность, reduced motion. Фирменные Beeline Sans, палитра и набор иконок сохранены по требованию пользователя.

Проверка команд: Node 22 `node --test scripts/offer-assistant.test.ts`. Проверки браузера: сборка, изменение условия/фона, составная команда, отмена, сохранение ручных полей на ширине 1280px. Новый мобильный сценарий в этой итерации не подтверждён: браузер не применил запрошенную ширину 390px. Голос с реальным микрофоном требует ручной проверки.

Проверка единого экрана: браузерные assertions подтвердили совпадение x/y/width/height карточки во время и после генерации, блокировку редактирования до готовности, доступный статус и отсутствие горизонтального переполнения на 1280px. Правка применяется под размытием, затем проявляется результат. Статусы зависят от имеющихся данных: без сайта и логотипа не утверждаем, что они были извлечены.

## Отдельная страница оформления · 9 ноября 2026

Все кнопки «запустить сейчас» в V4 ведут на `/#/v4/create`. Общий `CampaignWizard` поддерживает страницу и прежнее окно V3 без дублирования формы. Адреса `business`, `details`, `offer`, `audience`, `success` отражают три шага, проверку бизнеса и завершение настройки. Старый адрес `preview` совместим с новым экраном успеха. Работают переходы браузера назад/вперёд; незавершённые шаги нельзя пропустить прямой ссылкой. В шапке есть возврат к лендингу, действия закреплены снизу, прокручивается вся страница.

Один черновик, включая загруженные изображения, сохраняется в IndexedDB этого браузера. Возврат на лендинг и обновление страницы сохраняют заполненные поля и достигнутый шаг. Обычный статус сохранения скрыт; при ошибке хранения есть сообщение, при перезагрузке с несохранёнными данными браузер предупреждает о выходе. Серверного сохранения и привязки к аккаунту нет.

Анимация по референсу [21st.dev image generation loader](https://21st.dev/@syeddhasnainn/components/image-generation-loader): два движущихся облака на сетке точек и демонстрационный процент постепенно открывают тот же креатив. Canvas ограничен 30 кадрами/с и DPR 2; скрытая вкладка приостанавливает анимацию, reduced motion сразу показывает результат. Сохранены пропуск и повторная сборка. Проценты вычисляются по демо-таймеру, реального генеративного API нет.

Проверено в изолированном Chrome: CTA V4, валидация, все шаги, Back/Forward, возобновление с лендинга, восстановление текста/промокода/изображения после reload, запрет прямого пропуска шагов, размеры 320/390/768/1440px, неизменная геометрия креатива в координатах документа, прежнее окно V3 и Escape. Новые unit-проверки: `scripts/campaign-draft.test.ts`; браузерные assertions: `scripts/check-campaign-demo.mjs`, `scripts/check-offer-generation.mjs`. Реальные устройства и Safari требуют отдельной проверки.

Обновлённый редактор проверен на 320 и 602px: все действия доступны, холст не обрезается, горизонтального переполнения нет. Текстовый чат меняет скидку и размер чашки; отмена возвращает предыдущее состояние. Автосохранение и восстановление после reload проверены. Эффект сохраняет сетку точек из референса, CSS и таймер рассчитаны на 30 секунд; при скрытии вкладки отсчёт приостанавливается, reduced motion показывает результат сразу. Голос с настоящим микрофоном не проверялся.

### Упрощение экрана оффера

Заголовок готового состояния — «Ваш оффер готов», во время сборки — «Собираем ваш оффер». Повторы скидки под креативом удалены; пользовательский заголовок отражается в самом креативе, промокод и срок остаются дополнительными условиями. Основное действие — «Дальше: выбрать клиентов». На телефоне рядом с оффером есть «Изменить голосом»: переход к чату и запуск существующей диктовки. Кнопки отдельного сохранения нет, состояние автосохранения передаётся из владельца черновика. Валидация раскрывает скрытые поля и фокусирует конкретный input вместо fieldset.

### Выбор клиентов и завершение

На шаге клиентов основными стали география и момент показа. Пол, возраст и доход находятся в раскрываемом блоке, свободные пожелания необязательны. Справа отображаются текущие настройки и креатив; охват и прогнозы не выдумываются. У онлайн-бизнеса вариант рядом с точками недоступен; при выборе города нужно заполнить город показа.

«Завершить настройку» сохраняет данные и ведёт непосредственно на `/v4/create/success`. При ошибке записи экран успеха не показывается и доступна повторная попытка. Старые ссылки `preview` переводятся на `success`; номера этапов и существующие черновики сохраняют совместимость. Экран успеха показывает предложение, аудиторию, анимированную галочку и возврат к настройкам. Это завершение настройки, API запуска рекламы не добавлялся.

Проверены обновление итога при смене фильтров, возврат к бизнесу, онлайн-сценарий без города, блокировка завершения и прямого URL при незаполненном городе, сохранение и восстановление успеха. Проверки маршрутов добавлены в `scripts/campaign-draft.test.ts`; assertions аудитории и успеха — в `scripts/check-campaign-demo.mjs`.
