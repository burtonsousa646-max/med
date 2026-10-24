import { Card } from '@/components/Card'
import { AssistantChat } from '@/components/assistant/AssistantChat'

/** Полноэкранный вид чата. Тот же диалог доступен из шапки на любой странице. */
export function AssistantPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-headline-sm font-medium text-bee-content-primary">AI-помощник</h1>
        <p className="mt-1 text-body-sm text-bee-content-secondary">
          Отвечает на любые вопросы о платформе: модели офферов, интеграция, оферта, расчёты. Вызвать его можно из шапки на
          любой странице.
        </p>
      </div>
      <Card className="flex h-[560px] flex-col">
        <AssistantChat />
      </Card>
    </div>
  )
}
