# Landing V4

Route: `/#/v4`. V3 remains at `/#/v3`.

V4 has five visible content sections; the client logos and case studies are temporarily commented out, and the testimonial and bonus section was removed at the user's request. V4 follows one coffee campaign through business setup, creative, audience, placement and a final preview. Demonstration art consistently uses the existing «Зерно / −20% на первую покупку» creative. Demonstration data never enters the campaign form.

The how-it-works section has four scroll-stacking cards, inspired by the user's 21st.dev Stacking Cards reference. At widths of at least 540px and heights of at least 640px, native sticky positioning layers each new card over the previous ones; the installed Motion library slightly scales the covered cards with page-scroll progress. There is no nested scroll area or wheel interception. The section heading and launch action stay above the cards. Cards use restrained white, light grey and graphite surfaces, with small yellow accents and the existing purple offer. Each step keeps its full explanation and completed product illustration; the previous timed carousel is removed. On smaller windows and with reduced motion, all four cards appear in normal document flow. Placements remain manually selected beside a stable phone.

Metrics show their final values immediately. V4 styling is scoped under `.v4`; the existing campaign wizard and design-system components are reused. Shared sections expose optional calm presentation with original behavior as default.

## One section per screen

At widths of 600px and above, the hero, metrics, placements and final section have a minimum height of `100svh - 100px`, reserving the 76px sticky header and 24px of clearance. How-it-works is a deliberate exception: each card fits beneath the navigation and section heading, while the four steps provide the page-scroll distance for stacking. Sections can grow if their contents need more room. Navigation respects the header. Below 600px, the page keeps its natural content height.

Each section uses the available height for its composition. Metrics have a large headline and audience map above a bottom row of large figures; at 600–767px, the map sits between the heading and figures. Each story card pairs its explanation with a full-height product illustration. The artwork can grow beyond its original design size, and the final creative becomes a taller card with space reserved for its copy and coffee image.

Desktop windows up to 1100px high use tighter section spacing and a phone sized to the available height. Windows at least 1280×800 use larger headings and illustrations. At 600–767px, the story cards and placements retain two columns for the desktop preview pane. Phone contents scale with the phone, keeping the creative visible in every placement. The story artwork uses the actual illustration height instead of an oversized aspect-ratio placeholder.

The stacking-card revision passed layout assertions at 19 viewport sizes from 320×740 to 1920×1080, including the 539/540px breakpoint and 900×600. All four steps were checked scrolling forward and backward at 1440×800, 1280×640, 662×742 and 600×640; stacking also passed at 570×742. Cards fit below both headings, their copy stays inside the card, and their illustration stays inside its panel. Keyboard page scrolling, exiting the stack, reduced-motion fallback and the campaign CTA passed. The remaining four sections still fill one usable screen on desktop. Metrics assertions also check separation from the map. Real MacBook hardware and Safari were not checked.

## Verification

### Audience map

V4 replaces the regular dot grid with a dark vector map of central Moscow. The basemap uses actual OpenStreetMap road, water and park geometry, projected together with the points in Web Mercator, north up. Bounds: south 55.68, west 37.48, north 55.82, east 37.78. OSM snapshot: 2026-11-08T21:21:00Z, retrieved through `https://ovp.dresel.systems/api/interpreter`.

The 240 audience points are illustrative, deterministically sampled from OSM building centres. They are not subscriber records, a measured density or coverage data. Generation excludes water polygons and crowded point pairs. The accessible description identifies this as a demonstration. Visible captions under the map are removed at the user's request. The existing independent pulses pause outside the viewport and with reduced motion; static points remain visible.

`scripts/moscow-map.overpassql` reproduces the source query. Save its Overpass JSON response, then run `python3 scripts/build-audience-map.py /path/to/moscow-osm.json`. The script produces `public/img/moscow-audience-map.svg` and `src/screens/moscow-audience.json`; geographic-layer and point-placement assertions run during generation. The local SVG is 981 KB before compression, about 293 KB gzipped. No map SDK, API key or third-party map requests are needed at runtime.

Map data: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. The attribution link is in the page footer. The original dot-grid presentation remains on the other landing variants.

### Landing checks

- TypeScript and Vite production build passed.
- Browser inspected at 320, 375, 768 and 1440 px, plus the initial wide desktop viewport.
- Reusable browser assertions in `scripts/check-landing-v4.mjs` expect five sections, all four story cards, one selected placement, no horizontal overflow, separated header controls, a visible creative, and one screen for the four non-stacking sections on desktop.
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
