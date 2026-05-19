import { useAppStore } from '../store'

export function OptionsBar(): React.JSX.Element {
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
      <div className="panel-title">編碼選項</div>
      <div className="options-row">
        <label>
          編碼器
          <select value={encoder ?? ''} onChange={(e) => setEncoder(e.target.value)}>
            {encoders?.available.map((e) => (
              <option key={e} value={e}>
                {e}
                {e === encoders.preferred ? ' (推薦)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          畫質模式
          <select
            value={encoderQuality}
            onChange={(e) => setEncoderQuality(e.target.value as 'speed' | 'balanced' | 'quality')}
          >
            <option value="speed">速度優先（檔案大，CPU/GPU 最低）</option>
            <option value="balanced">平衡（推薦）</option>
            <option value="quality">畫質優先（同 bitrate 下最清楚）</option>
          </select>
        </label>
        <label>
          FPS
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
          位元率
          <select value={bitrate} onChange={(e) => setBitrate(e.target.value)}>
            <option value="200K">0.2 Mbps（極低，僅供文字/簡報）</option>
            <option value="500K">0.5 Mbps（低）</option>
            <option value="1M">1 Mbps</option>
            <option value="3M">3 Mbps</option>
            <option value="6M">6 Mbps（推薦 720p）</option>
            <option value="12M">12 Mbps（推薦 1080p）</option>
            <option value="20M">20 Mbps（高）</option>
            <option value="40M">40 Mbps（極高 / 4K）</option>
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={drawMouse} onChange={(e) => setDrawMouse(e.target.checked)} />
          顯示游標
        </label>
        <label className="checkbox" title="錄影中滑鼠點擊位置會出現黃色圓圈漣漪">
          <input
            type="checkbox"
            checked={clickHighlightEnabled}
            onChange={(e) => setClickHighlightEnabled(e.target.checked)}
          />
          點擊高亮
        </label>
      </div>
    </div>
  )
}
