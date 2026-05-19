import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store'

export function OptionsBar(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    encoders,
    encoder,
    setEncoder,
    encoderQuality,
    setEncoderQuality,
    framerate,
    setFramerate,
    drawMouse,
    setDrawMouse,
    bitrate,
    setBitrate,
    clickHighlightEnabled,
    setClickHighlightEnabled
  } = useAppStore()

  return (
    <div className="panel">
      <div className="panel-title">{t('optionsBar.title')}</div>
      <div className="options-row">
        <label>
          {t('optionsBar.encoder')}
          <select value={encoder ?? ''} onChange={(e) => setEncoder(e.target.value)}>
            {encoders?.available.map((e) => (
              <option key={e} value={e}>
                {e}
                {e === encoders.preferred ? ` (${t('common.recommended')})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('optionsBar.quality')}
          <select
            value={encoderQuality}
            onChange={(e) => setEncoderQuality(e.target.value as 'speed' | 'balanced' | 'quality')}
          >
            <option value="speed">{t('optionsBar.qualitySpeed')}</option>
            <option value="balanced">{t('optionsBar.qualityBalanced')}</option>
            <option value="quality">{t('optionsBar.qualityQuality')}</option>
          </select>
        </label>
        <label>
          {t('optionsBar.fps')}
          <select value={framerate} onChange={(e) => setFramerate(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={20}>20</option>
            <option value={24}>24</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
        <label>
          {t('optionsBar.bitrate')}
          <select value={bitrate} onChange={(e) => setBitrate(e.target.value)}>
            <option value="200K">{t('optionsBar.bitrate200K')}</option>
            <option value="500K">{t('optionsBar.bitrate500K')}</option>
            <option value="1M">{t('optionsBar.bitrate1M')}</option>
            <option value="3M">{t('optionsBar.bitrate3M')}</option>
            <option value="6M">{t('optionsBar.bitrate6M')}</option>
            <option value="12M">{t('optionsBar.bitrate12M')}</option>
            <option value="20M">{t('optionsBar.bitrate20M')}</option>
            <option value="40M">{t('optionsBar.bitrate40M')}</option>
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={drawMouse} onChange={(e) => setDrawMouse(e.target.checked)} />
          {t('optionsBar.drawMouse')}
        </label>
        <label className="checkbox" title={t('optionsBar.clickHighlightTooltip')}>
          <input
            type="checkbox"
            checked={clickHighlightEnabled}
            onChange={(e) => setClickHighlightEnabled(e.target.checked)}
          />
          {t('optionsBar.clickHighlight')}
        </label>
      </div>
    </div>
  )
}
