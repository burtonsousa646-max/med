import { useEffect, useRef, useState } from 'react'
import './medWidget.css'

type Color = 'honey' | 'berry' | 'mint'
type Stage = 'play' | 'auth' | 'reward'
type Outcome = 'idle' | 'checking' | 'win' | 'lose'

const PALETTE: Color[] = ['honey', 'berry', 'mint']
const COLOR_LABEL: Record<Color, string> = { honey: 'Янтарь', berry: 'Гранат', mint: 'Нефрит' }
const PRIZES: Array<{ text: string; cash?: boolean }> = [
  { text: '−15%' },
  { text: '−1000', cash: true },
  { text: '−30%' },
  { text: '−45%' },
  { text: '−10%' },
  { text: '−500', cash: true },
  { text: '−20%' },
]
const DEMO_CODE = '1234'
const PROMO_CODE = 'HONEY20'

function Snitch() {
  return (
    <span className="med-snitch" aria-hidden="true">
      <i className="med-snitch-wing left" />
      <i className="med-snitch-wing right" />
      <span className="med-snitch-orb">
        <i />
      </span>
    </span>
  )
}

const pickColor = (): Color => PALETTE[Math.floor(Math.random() * PALETTE.length)]

/**
 * Демонстрация виджета МЁД, который партнёр размещает на своём сайте: плавающая «сота» с призами,
 * по клику — мини-игра с авторизацией и промокодом. Показывается в калькуляторе, когда выбрана услуга
 * «Виджет МЁД». Первая попытка выигрывает с шансом 58%, вторая — всегда (так задумано в демо).
 */
export function MedWidgetDemo({ active }: { active: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [open, setOpen] = useState(false)

  const [stage, setStage] = useState<Stage>('play')
  const [cells, setCells] = useState<Array<Color | null>>(() => Array(7).fill(null))
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const [authMode, setAuthMode] = useState<'phone' | 'yandex'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const attemptRef = useRef(0)
  const roundRef = useRef<{ win: boolean; color: Color }>({ win: false, color: 'honey' })
  const timerRef = useRef<number | undefined>(undefined)
  const picked = cells.filter(Boolean).length

  useEffect(() => {
    setDismissed(false)
    if (active) setAnimKey((k) => k + 1)
    else setOpen(false)
  }, [active])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  function resetRound() {
    window.clearTimeout(timerRef.current)
    setCells(Array(7).fill(null))
    setOutcome('idle')
  }

  function openGame() {
    resetRound()
    setStage('play')
    setCodeSent(false)
    setCode('')
    setError('')
    setCopied(false)
    setOpen(true)
  }

  function closeGame() {
    window.clearTimeout(timerRef.current)
    setOpen(false)
    setCodeSent(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeGame()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function chooseCell(index: number) {
    if (cells[index] || picked >= 3) return
    if (picked === 0) {
      attemptRef.current += 1
      roundRef.current = { win: attemptRef.current > 1 || Math.random() < 0.58, color: pickColor() }
    }
    const { win, color: base } = roundRef.current
    let color = base
    if (!win && picked === 1) color = PALETTE.filter((c) => c !== base)[Math.floor(Math.random() * 2)]
    if (!win && picked === 2) color = pickColor()

    const next = cells.slice()
    next[index] = color
    setCells(next)

    if (picked + 1 === 3) {
      setOutcome('checking')
      timerRef.current = window.setTimeout(() => setOutcome(win ? 'win' : 'lose'), 520)
    }
  }

  function onPhoneAction() {
    if (!codeSent) {
      if (phone.replace(/\D/g, '').length < 10) return setError('Введите номер полностью')
      setError('')
      setCodeSent(true)
      return
    }
    if (code !== DEMO_CODE) return setError(`Для демо используйте код ${DEMO_CODE}`)
    setError('')
    setStage('reward')
  }

  async function copyPromo() {
    try {
      await navigator.clipboard.writeText(PROMO_CODE)
    } catch {
      /* буфер обмена недоступен — в демо достаточно отметки */
    }
    setCopied(true)
  }

  const resultLine =
    outcome === 'win' ? (
      <>
        <strong>Совпадение</strong>
        <span>Бонус разблокирован.</span>
      </>
    ) : outcome === 'lose' ? (
      <>
        <strong>Не совпало</strong>
        <span>Ещё одна попытка — за нами.</span>
      </>
    ) : (
      <span>
        {picked === 0 ? 'Нажми на первую соту' : picked < 3 ? `Осталось выбрать: ${3 - picked}` : 'Проверяем сочетание…'}
      </span>
    )

  const showWidget = active && !dismissed && !open

  return (
    <>
      {showWidget && (
        <div
          key={animKey}
          className="med-widget-shell is-active"
          role="button"
          tabIndex={0}
          aria-label="Открыть игру МЁД"
          onClick={openGame}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              openGame()
            }
          }}
        >
          <button
            className="med-widget-close"
            type="button"
            aria-label="Скрыть виджет"
            onClick={(e) => {
              e.stopPropagation()
              setDismissed(true)
            }}
          >
            ×
          </button>
          <span className="med-widget-hint">
            <b>МЁД</b> · поймай бонус
          </span>
          <Snitch />
          <span className="med-widget-hive" aria-hidden="true">
            {PRIZES.map((p) => (
              <i key={p.text} className="med-widget-hex">
                <span className={`med-widget-prize${p.cash ? ' cash' : ''}`}>{p.text}</span>
              </i>
            ))}
          </span>
        </div>
      )}

      <div className={`med-game-dim${open ? ' on' : ''}`} onClick={closeGame} />
      <section className={`med-game-modal${open ? ' on' : ''}`} role="dialog" aria-modal="true" aria-label="Игра МЁД">
        <button className="med-game-close" type="button" aria-label="Закрыть" onClick={closeGame}>
          ×
        </button>
        <div className="med-modal-snitch">
          <Snitch />
        </div>

        {open && stage === 'play' && (
          <div className="med-game-view">
            <span className="med-game-eyebrow">МЁД</span>
            <h2>Выбери три соты</h2>
            <p className="med-game-lead">Открой любые три. Одинаковый оттенок принесёт бонус.</p>
            <div className="med-game-stage">
              {cells.map((color, i) => (
                <button
                  key={i}
                  type="button"
                  className={`med-game-cell${color ? ` reveal ${color}` : ''}`}
                  disabled={Boolean(color) || picked >= 3}
                  aria-label={color ? `Открытая сота: ${COLOR_LABEL[color]}` : `Закрытая сота ${i + 1}`}
                  onClick={() => chooseCell(i)}
                >
                  <span />
                </button>
              ))}
            </div>
            <div className="med-game-result">{resultLine}</div>
            <button
              className="med-game-primary"
              type="button"
              disabled={outcome !== 'win' && outcome !== 'lose'}
              onClick={() => (outcome === 'win' ? setStage('auth') : resetRound())}
            >
              {outcome === 'win' ? 'Забрать бонус' : outcome === 'lose' ? 'Попробовать ещё' : `Выбрано ${picked} из 3`}
            </button>
            <span className="med-game-terms">18+ · Один бонус на участника</span>
          </div>
        )}

        {open && stage === 'auth' && (
          <div className="med-game-view">
            <span className="med-game-eyebrow">Последний шаг</span>
            <h2>Сохраним твой бонус</h2>
            <p className="med-game-lead">Авторизуйся один раз — промокод появится сразу.</p>
            <div className="med-game-tabs">
              <button type="button" className={authMode === 'phone' ? 'active' : ''} onClick={() => setAuthMode('phone')}>
                Телефон
              </button>
              <button type="button" className={authMode === 'yandex' ? 'active' : ''} onClick={() => setAuthMode('yandex')}>
                Яндекс ID
              </button>
            </div>
            <div style={{ width: '100%' }}>
              {authMode === 'phone' ? (
                <div className="med-game-form">
                  <label htmlFor="med-widget-phone">Номер телефона</label>
                  <input
                    id="med-widget-phone"
                    type="tel"
                    placeholder="+7 999 123-45-67"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  {codeSent && (
                    <>
                      <div className="med-game-demo-code">
                        Демо-код: <b>{DEMO_CODE}</b>
                      </div>
                      <label htmlFor="med-widget-code">Код из сообщения</label>
                      <input
                        id="med-widget-code"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="••••"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </>
                  )}
                  <span className="med-game-error">{error}</span>
                  <button className="med-game-primary" type="button" onClick={onPhoneAction}>
                    {codeSent ? 'Подтвердить' : 'Получить код'}
                  </button>
                </div>
              ) : (
                <div className="med-game-yandex">
                  <div className="med-game-yandex-mark">Я</div>
                  <b>Войти с Яндекс ID</b>
                  <span>Быстро и без нового пароля</span>
                  <button type="button" onClick={() => window.setTimeout(() => setStage('reward'), 450)}>
                    Продолжить
                  </button>
                </div>
              )}
            </div>
            <small className="med-game-auth-note">Продолжая, вы соглашаетесь с правилами акции и обработкой данных.</small>
          </div>
        )}

        {open && stage === 'reward' && (
          <div className="med-game-view" style={{ justifyContent: 'center', paddingTop: 65 }}>
            <div className="med-game-badge">✓</div>
            <span className="med-game-eyebrow">Бонус активирован</span>
            <h2>−20% на первую покупку</h2>
            <p className="med-game-lead">Используй промокод в корзине демо-магазина.</p>
            <button className="med-game-promo" type="button" onClick={copyPromo}>
              <b>{PROMO_CODE}</b>
              <em>{copied ? 'Скопировано' : 'Копировать'}</em>
            </button>
            <button className="med-game-primary" type="button" onClick={closeGame}>
              Перейти к покупкам
            </button>
            <span className="med-game-valid">Действует 48 часов</span>
          </div>
        )}
      </section>
    </>
  )
}
