import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'

export function LogPanel(): React.JSX.Element {
  const { logs } = useAppStore()
  const [open, setOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const ref = useRef<HTMLTextAreaElement>(null)
  const autoStickRef = useRef(true)

  useEffect(() => {
    if (!autoStickRef.current) return
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [logs])

  const text = logs.join('\n')

  const copyAll = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch (e) {
      console.error('copy failed', e)
    }
  }

  const onScroll = (): void => {
    if (!ref.current) return
    const el = ref.current
    autoStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return (
    <div className={`log-panel ${open ? 'open' : ''}`}>
      <div className="log-toolbar">
        <button className="log-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? '▼' : '▲'} FFmpeg 日誌 ({logs.length})
        </button>
        {open && (
          <>
            <button className="btn-small" onClick={copyAll}>
              {copyState === 'copied' ? '✓ 已複製' : '複製全部'}
            </button>
            <button
              className="btn-small"
              onClick={() => {
                if (ref.current) {
                  ref.current.focus()
                  ref.current.select()
                }
              }}
            >
              全選
            </button>
          </>
        )}
      </div>
      {open && (
        <textarea
          ref={ref}
          className="log-textarea"
          readOnly
          spellCheck={false}
          value={text}
          onScroll={onScroll}
        />
      )}
    </div>
  )
}
