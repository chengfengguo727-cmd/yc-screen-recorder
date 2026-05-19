import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: Props): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!open) return null

  const quickStartItems = t('help.quickStartItems', { returnObjects: true }) as string[]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>{t('help.title')}</div>
          <button className="btn-small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body help-body">
          <section className="opt-section">
            <h3>{t('help.quickStart')}</h3>
            <ol>
              {Array.isArray(quickStartItems) &&
                quickStartItems.map((line, i) => <li key={i}>{line}</li>)}
            </ol>
          </section>

          <section className="opt-section">
            <h3>{t('help.hotkeys')}</h3>
            <ul>
              <li>
                <strong>{t('help.hotkeyRecord')}</strong>
              </li>
              <li>
                <strong>{t('help.hotkeyShot')}</strong>
              </li>
            </ul>
          </section>

          <section className="opt-section">
            <h3>{t('help.sttSec')}</h3>
            <p>{t('help.sttDesc')}</p>
            <ul>
              <li>{t('help.sttItem1')}</li>
              <li>{t('help.sttItem2')}</li>
              <li>{t('help.sttItem3')}</li>
            </ul>
          </section>

          <section className="opt-section">
            <h3>{t('help.encoding')}</h3>
            <ul>
              <li>{t('help.encItem1')}</li>
              <li>{t('help.encItem2')}</li>
              <li>{t('help.encItem3')}</li>
              <li>{t('help.encItem4')}</li>
            </ul>
          </section>

          <section className="opt-section">
            <h3>{t('help.recOps')}</h3>
            <ul>
              <li>{t('help.recItem1')}</li>
              <li>{t('help.recItem2')}</li>
              <li>{t('help.recItem3')}</li>
            </ul>
          </section>

          <section className="opt-section">
            <h3>{t('help.schedule')}</h3>
            <p>{t('help.scheduleDesc')}</p>
          </section>

          <section className="opt-section">
            <h3>{t('help.tray')}</h3>
            <p>{t('help.trayDesc')}</p>
          </section>

          <section className="opt-section">
            <h3>{t('help.troubleshooting')}</h3>
            <ul>
              <li>{t('help.tsItem1')}</li>
              <li>{t('help.tsItem2')}</li>
              <li>{t('help.tsItem3')}</li>
              <li>{t('help.tsItem4')}</li>
              <li>{t('help.tsItem5')}</li>
            </ul>
          </section>
        </div>
        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          <button className="btn btn-record" onClick={onClose}>
            {t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
