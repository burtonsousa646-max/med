# Landing V4

Route: `/#/v4`. V3 remains at `/#/v3`.

V4 retains seven V3 content sections in their original order; the testimonial and bonus section was removed at the user's request. V4 follows one coffee campaign through business setup, creative, audience, placement and a final preview. Demonstration art consistently uses the existing «Зерно / −20% на первую покупку» creative. Demonstration data never enters the campaign form.

The how-it-works section now has four selectable explanations and one coordinated product stage. Playback loops while at least 35% of the stage is visible and the page is active; leaving the viewport or hiding the tab pauses it. Manual selection jumps to a step and autoplay continues. Playback buttons on the story, hero and audience dots are removed in V4. Reduced motion shows completed scene states and disables automatic playback. Placements are manually selected beside a stable phone; the ad card uses a shared layout transition. Mobile placement explanations appear below the phone.

Six client logos are static. Metrics, case results and bonus amounts show their final values immediately. V4 styling is scoped under `.v4`; the existing campaign wizard and design-system components are reused. Shared sections expose optional calm presentation with original behavior as default.

## Verification

- TypeScript and Vite production build passed.
- Browser inspected at 320, 375, 768 and 1440 px, plus the initial wide desktop viewport.
- The original eight-section layout, six logos, one selected story step, one selected placement, no horizontal overflow, and separated header controls were verified with assertions. Reusable browser assertions in `scripts/check-landing-v4.mjs` now expect seven sections after removal of the testimonial and bonus block.
- Story autoplay cycles past step four and pauses outside the viewport; manual selection remains available.
- Placement switching, stable phone and visible campaign creative checked.
- CTA opened the existing wizard at 320 px; focus entered the dialog; Escape closed it and restored focus.
- V3 regression check retained eight sections and its original four-card setup layout.
- No browser console errors observed.

Not checked: real mobile hardware, Safari, OS reduced-motion runtime or real campaign submission. The existing wizard creates a local draft; this pass adds no campaign publishing API. Existing metrics, customer examples and bonus claims were retained, not independently verified.

## Campaign wizard demo

The wizard uses local fixtures from `src/screens/campaign-demo.ts`; business lookup no longer calls the API. Existing server code is retained but not used by this flow. The example button fills sample INN and phone values; a cancellable local delay demonstrates lookup before editable business details and address appear. V3 keeps its in-memory modal. V4 now opens the separate page described below; its draft and image files are stored locally in IndexedDB.

The first step is compact, with a real creative preview, inline validation and focus feedback. Offer discount and the suggested title stay synchronized; custom titles are preserved. The final summary includes discount, promo code and date. Browser checks covered the complete demo, back navigation, errors, cancellation, dynamic preview and 320/375/1280 px layout. Reusable assertions: `scripts/check-campaign-demo.mjs`. File upload and local speech recognition were not exercised in this pass.

### Сборка и правки оффера

На втором шаге генерация и редактирование находятся на одном экране. Постоянная карточка проявляется из размытой поверхности за 4,25 секунды; короткие статусы размещены под ней. Нет отдельной сцены и списка этапов. Размер и положение карточки сохраняются при завершении. Инструменты правки мягко появляются рядом, без смены экрана. Проявление можно пропустить или повторить без изменения данных. При reduced motion показ сокращается; при скрытой вкладке таймер и эффект приостанавливаются.

В редакторе креатив находится рядом с запросом к помощнику. Демо поддерживает цвет фона, скидку, предложение «1 + 1», размер чашки, промокод и заголовок в кавычках. Правка сопровождается анимацией карточки, результат можно отменить. Ручная правка сбрасывает старую отмену, чтобы не потерять новые данные. Ручные поля доступны через «изменить вручную»; при ошибке в скрытом поле раздел автоматически раскрывается.

Голосовая кнопка использует SpeechRecognition браузера, показывает распознанный текст и требует нажатия стрелки для применения. При отсутствии API или ошибке микрофона остаются текст и примеры. Реального генеративного API нет. Распознавание речи может использовать сервис браузера. Данные кампании не отправляются в бэкенд.

Применён landing-page-design: визуальный приоритет креатива, компактная иерархия, явные состояния управления, адаптивность, reduced motion. Фирменные Beeline Sans, палитра и набор иконок сохранены по требованию пользователя.

Проверка команд: Node 22 `node --test scripts/offer-assistant.test.ts`. Проверки браузера: сборка, изменение условия/фона, составная команда, отмена, сохранение ручных полей на ширине 1280px. Новый мобильный сценарий в этой итерации не подтверждён: браузер не применил запрошенную ширину 390px. Голос с реальным микрофоном требует ручной проверки.

Проверка единого экрана: браузерные assertions подтвердили совпадение x/y/width/height карточки во время и после генерации, блокировку редактирования до готовности, доступный статус и отсутствие горизонтального переполнения на 1280px. Правка применяется под размытием, затем проявляется результат. Статусы зависят от имеющихся данных: без сайта и логотипа не утверждаем, что они были извлечены.

## Отдельная страница оформления · 9 ноября 2026

Все кнопки «запустить сейчас» в V4 ведут на `/#/v4/create`. Общий `CampaignWizard` поддерживает страницу и прежнее окно V3 без дублирования формы. Адреса `business`, `details`, `offer`, `audience`, `preview` отражают три шага, проверку бизнеса и итоговый черновик. Работают переходы браузера назад/вперёд; незавершённые шаги нельзя пропустить прямой ссылкой. В шапке есть возврат к лендингу, действия закреплены снизу, прокручивается вся страница.

Один черновик, включая загруженные изображения, сохраняется в IndexedDB этого браузера. Возврат на лендинг и обновление страницы сохраняют заполненные поля и достигнутый шаг. Состояние сохранения показано над формой; при ошибке хранения есть сообщение, при перезагрузке с несохранёнными данными браузер предупреждает о выходе. Серверного сохранения и привязки к аккаунту нет.

Анимация по референсу [21st.dev image generation loader](https://21st.dev/@syeddhasnainn/components/image-generation-loader): два движущихся облака на сетке точек и демонстрационный процент постепенно открывают тот же креатив. Canvas ограничен 30 кадрами/с и DPR 2; скрытая вкладка приостанавливает анимацию, reduced motion сразу показывает результат. Сохранены пропуск и повторная сборка. Проценты вычисляются по демо-таймеру, реального генеративного API нет.

Проверено в изолированном Chrome: CTA V4, валидация, все шаги, Back/Forward, возобновление с лендинга, восстановление текста/промокода/изображения после reload, запрет прямого пропуска шагов, размеры 320/390/768/1440px, неизменная геометрия креатива в координатах документа, прежнее окно V3 и Escape. Новые unit-проверки: `scripts/campaign-draft.test.ts`; браузерные assertions: `scripts/check-campaign-demo.mjs`, `scripts/check-offer-generation.mjs`. Реальные устройства и Safari требуют отдельной проверки.
