# Инструкция агенту: генерация офферов МЁД

Рабочий сценарий для текущего редактора. Все команды ниже выполняются из `prototype-app` на Node.js **22.18 или новее**. Не заменяй этот сценарий простым переключением цветов или компоновок.

## Что считается готовым результатом

Оффер содержит подтверждённые текст, выгоду и условия, отдельный логотип и отдельное изображение предмета предложения. Текущий шаблон — текст слева, изображение справа. Кнопка «Создать ещё» в разделе «Другие креативы» меняет изображение; заголовок, скидка, промокод, срок, логотип и цвет фона сохраняются. «Вернуть предыдущий» восстанавливает предыдущую картинку. В интерфейсе не добавляй другие шаблоны и выбор компоновки.

Текст, цены, скидки, промокоды, даты, логотипы и кнопки рисует приложение. Генератор изображений не должен встраивать их в картинку.

## Сначала прочитай источники

1. `docs/campaign-offer-rules.md` — правила фактов и текста. Этот файл уже используется текстовым помощником.
2. `docs/offer-image-prompt.md` — промпт предметного изображения. Сервер читает текст после разделителя `---`.
3. `shared/campaign-offer.ts` — действующие типы и проверки оффера.
4. `shared/offer-image.ts` — вход генерации изображения.
5. `server/offer-image.ts`, `public/img/offer-variants/catalog.json` — живая генерация и локальный каталог.

Перед изменениями проверь `git status --short` и сохрани чужие изменения. Не читай и не выводи значения ключей. Для проверки окружения достаточно признака «задан / не задан».

## Подготовь содержание оффера

Получи сферу бизнеса, предмет предложения и подтверждённые условия. Скидку, подарок, минимальную сумму, промокод и срок не придумывай. Если условия не заданы, используй нейтральное приглашение без финансовых обещаний. Если указано «до 20%», не превращай это в фиксированные 20%.

Для текущего JSON используй `OfferDraft`:

```json
{
  "title": "На первый заказ кофе",
  "promo": "",
  "discount": "",
  "until": "",
  "tone": "violet",
  "gift": false,
  "zoom": false,
  "layout": "split"
}
```

Это пример структуры, а не разрешение менять действующие условия бизнеса. Сначала проверь объект функцией `offerErrors`. Существующие скидку, промокод и дату оставь как есть, если пользователь не просил их изменить.

## Локально: подготовь настоящие варианты изображений

Сейчас для кофейни подключены три разных PNG: `coffee-ivory.png`, `coffee-teal.png`, `coffee-takeaway.png`. Они созданы встроенным Imagegen. Локальный сервер читает каталог при каждом запросе: для добавления готового файла не нужно переписывать генератор.

Для новой сферы:

1. Используй установленный навык `imagegen` и встроенный инструмент генерации изображений. Он не требует серверного API-ключа. Не подменяй предметную иллюстрацию CSS, SVG или случайным изображением другой сферы.
2. Прочитай `docs/offer-image-prompt.md` и создай **минимум три отдельных изображения** с разными композициями или ракурсами одного предмета предложения. Для конкретного товара или реальной работы используй подтверждённое фото как reference, сохраняя характеристики. Не выдавай вымышленное фото за работу бизнеса.
3. Для каждой генерации явно запроси настоящий прозрачный фон. Не достаточно написать это только в тексте: включи параметр прозрачного фона инструмента. Размер от 1024 × 1024 px, файл PNG RGBA, до 5 МБ. Предмет целиком и с отступами минимум 10%, без букв, логотипов и интерфейса.
4. Просмотри каждый результат. Отбракуй обрезанный предмет, нечитаемый силуэт, посторонние надписи, непрозрачный или нарисованный шахматный фон. Сохранённый alpha-канал должен действительно содержать прозрачные пиксели.
5. Скопируй итоговые файлы в `public/img/offer-variants/`. Исходники генератора оставь на месте. Имена — строчные латинские буквы, цифры и дефисы, расширение `.png`. Не перезаписывай чужие материалы.
6. Добавь группу в `public/img/offer-variants/catalog.json`. `categories` содержит фрагменты сферы бизнеса, `files` — только имена файлов из этой папки. Не используй URL, `..`, абсолютные пути и общие слова, которые совпадут с другой сферой. Пример формы новой группы:

```json
{
  "coffee": {
    "categories": ["кофей", "кофе", "coffee"],
    "files": ["coffee-ivory.png", "coffee-teal.png", "coffee-takeaway.png"]
  }
}
```

7. Запусти тест каталога, затем проверь варианты в браузере. Два одинаковых файла под разными именами не считаются разными креативами.

При неизвестной сфере сервер возвращает понятную ошибку 409 и сохраняет текущий креатив. Не добавляй автоматическую подстановку кофейной картинки для любого бизнеса.

## Проверенный промпт для одного варианта

Следующий промпт использован для `coffee-ivory.png`. Для другого бизнеса замени предмет, сохраняя технические требования и подтверждённые характеристики:

> Use case: ads-marketing. Create ONE isolated premium 3D product illustration for the image slot in a Russian coffee-shop offer card. Subject: a short matte ivory ceramic cappuccino cup with generous latte art, viewed from a readable three-quarter angle, on a matching small saucer, a few realistic roasted coffee beans arranged beside the saucer. Clearly different from a tall glass latte or a green ceramic cup. Whole object visible with generous clear margins, all contents centered. Soft studio light, polished tactile ceramic, realistic coffee foam. Transparent background with real alpha, no opaque backdrop, no colored panels. No text, no lettering, no logos, no numbers, no buttons, no watermark, no border. Square asset, suitable for the right half of a violet offer card at 280px display width. Do not generate a full banner or a UI screenshot.

Промпт для `coffee-teal.png`:

> Single isolated premium 3D product illustration for a coffee-shop offer. A deep teal ceramic cappuccino cup and matching saucer, viewed at an elevated three-quarter angle, distinct crisp heart latte art visible. Whole cup and saucer visible with 12% clear margins, centered, soft studio light, tactile glazed ceramic, realistic foam. Actual transparent alpha background. No text, no logo, no watermark, no advertising card, no typography, no decorative background. Square asset at least 1024px, for the right image area of a violet offer card.

Промпт для `coffee-takeaway.png`:

> Single isolated premium 3D product illustration for a coffee-shop offer. A plain unbranded kraft takeaway coffee cup with a black lid, several large realistic roasted coffee beans at its base. Three-quarter view, centered upright complete silhouette, whole cup visible with 12% clear margins. Warm tactile materials, soft studio light, clean commercial realism. Actual transparent alpha background. No text, no logo, no letters, no watermark, no advertising card, no typography, no decorative background. Square asset at least 1024px, for the right image area of a violet offer card.

Все три финальных файла находятся в `public/img/offer-variants/`. Одинаковое предложение остаётся в полях карточки.

## Запусти локальное демо

Сначала проверь, не запущены ли API и Vite. Не останавливай чужие процессы. Для отдельного стенда можно использовать два терминала:

```sh
OFFER_IMAGE_PROVIDER=demo API_PORT=8789 DB_PATH=/private/tmp/med-offer-agent.sqlite node --watch --disable-warning=ExperimentalWarning server/index.ts
```

```sh
API_PORT=8789 npm exec -- vite --host 127.0.0.1 --port 5186 --strictPort
```

Открой `http://127.0.0.1:5186/#/v4/create`. Заполни бизнес или используй существующий корректный локальный черновик. Для готового каталога сфера — «Кофе и завтраки». На шаге оффера раскрой «Другие креативы» и нажми «Создать ещё» три раза: должны появиться три разных изображения внутри одной карточки. В демо показывается пометка о подготовленных вариантах; новый платный запрос к модели не выполняется.

Прямая проверка API без создания заявки и отправки писем:

```sh
curl --fail --silent --show-error http://127.0.0.1:8789/api/v4/offer-image \
  -F 'input={"category":"Кофе и завтраки","title":"На первый заказ кофе","variant":0}' \
  -o /private/tmp/med-offer-agent.png
```

Проверь файл как PNG и открой его визуально. HTTP 200 сам по себе не подтверждает прозрачность или качество изображения.

## Подключи API, когда появится ключ

Секрет хранится **только на сервере**. Поддерживаются `OPENAI_API_KEY` и `OPENAI_API_KEY_FILE`. Предпочтителен файл с доступом только владельцу или секрет хостинга. Не добавляй ключ в Git, браузер, `VITE_*`, команды с буквальным значением или сообщения чата.

Пример конфигурации с файлом секрета, который пользователь создаст отдельно:

```sh
OFFER_IMAGE_PROVIDER=openai \
OFFER_IMAGE_MODEL=gpt-image-2.5-flare \
OPENAI_API_KEY_FILE=/absolute/private/path/openai-api-key \
API_PORT=8789 DB_PATH=/private/tmp/med-offer-agent-live.sqlite \
node --watch --disable-warning=ExperimentalWarning server/index.ts
```

Путь — заполнитель: замени его на фактический путь файла, не выводя содержимое. Перезапусти API после изменения окружения. Наличие ключа не включает платные запросы автоматически: требуется `OFFER_IMAGE_PROVIDER=openai`. В production демо отключено; при ошибке живой генерации сервер не подставляет подготовленную картинку.

Без исходного фото сервер вызывает `POST /v1/images/generations`; с фото — `POST /v1/images/edits`. Передаются только сфера, заголовок и необязательное фото, без ИНН, телефона, адреса, отдельного промокода и логотипа. Браузер готовит исходное фото как PNG, сервер запрашивает прозрачный PNG и проверяет ответ. Детали API: [создание изображения](https://developers.openai.com/api/reference/resources/images/methods/generate), [редактирование](https://developers.openai.com/api/reference/resources/images/methods/edit).

Пока ключ не предоставлен, не заявляй, что реальная генерация проверена. Автотесты проверяют контракт через подмену HTTP-ответа. После подключения ключа проверь один настоящий запрос без исходного фото и один с фото, включая декодирование файла и прозрачность.

Лимиты текущего обработчика: два одновременных запроса, 30 запросов в сутки на процесс, 120 секунд ожидания, до 5 МБ на результат. Для нескольких серверных экземпляров нужен общий счётчик; не представляй эти локальные лимиты как пользовательские квоты или тарификацию.

## Обязательная проверка перед отчётом

```sh
node --disable-warning=ExperimentalWarning --test server/offer-image.test.ts scripts/campaign-draft.test.ts scripts/offer-assistant.test.ts scripts/offer-assets.test.ts
npm run build
```

В браузере на ширине 390 и 1440 px проверь:

- Каждый из трёх вариантов отличается по содержимому картинки. Цвет, компоновка и поля оффера сохраняются.
- Логотип и все четыре предпросмотра используют актуальный вариант.
- «Вернуть предыдущий» возвращает изображение и сохраняет последующие правки текста.
- После перезагрузки остаётся выбранная картинка; в запросе сохранения на сервер передаётся именно она.
- Ошибка и отмена генерации сохраняют прежнее изображение. Повторные клики во время запроса не создают второй запрос.
- Готовый загруженный макет не заменяется генератором.
- У PNG действительно есть прозрачные и непрозрачные пиксели, а при кадрировании прозрачность сохраняется.

Не отправляй настоящую заявку и письма ради проверки редактора. В отчёте укажи, какой режим проверен, какие файлы добавлены, результаты тестов и что остаётся непроверенным.
