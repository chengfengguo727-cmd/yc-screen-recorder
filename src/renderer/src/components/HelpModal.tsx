interface Props {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: Props): React.JSX.Element | null {
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>說明</div>
          <button className="btn-small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body help-body">
          <section className="opt-section">
            <h3>快速開始</h3>
            <ol>
              <li>在「擷取來源」選要錄的螢幕、或拖框選區域、或選整個虛擬桌面</li>
              <li>需要的話，勾選「系統音」/「麥克風」/「Webcam (PiP)」</li>
              <li>按 ● 開始錄影；可隨時 ⏸ 暫停、▶ 續錄、■ 停止</li>
              <li>檔案輸出位置可在 ⚙ 設定 → 輸出資料夾調整</li>
            </ol>
          </section>

          <section className="opt-section">
            <h3>全域熱鍵</h3>
            <ul>
              <li><strong>Ctrl + Shift + R</strong> — 開始 / 停止錄影（任何視窗都能用）</li>
              <li><strong>Ctrl + Shift + S</strong> — 截圖</li>
            </ul>
          </section>

          <section className="opt-section">
            <h3>即時 STT（字幕）</h3>
            <p>勾選「錄影時即時生成 SRT」後，錄影同時會用 whisper.cpp 在另一條 process 即時辨識語音，輸出 SRT 字幕檔。</p>
            <ul>
              <li>第一次使用要先在 STT 區下載模型（base 148 MB / small 488 MB）</li>
              <li>中文建議用 small 模型 + 語言選「中文」</li>
              <li>錄完後可在「錄影檔」列表點「🔥 燒進字幕」把字幕燒進影片畫面</li>
            </ul>
          </section>

          <section className="opt-section">
            <h3>編碼建議</h3>
            <ul>
              <li><strong>畫質模式</strong>：低位元率（&lt;3 Mbps）建議用「畫質優先」</li>
              <li><strong>位元率</strong>：1080p30 一般選 6–12 Mbps；要小檔可降到 1 Mbps</li>
              <li><strong>FPS</strong>：螢幕教學 15–30 fps 足夠；遊戲類才需要 60</li>
              <li>硬體編碼：NVIDIA / Intel iGPU / AMD GPU 都會被自動偵測</li>
            </ul>
          </section>

          <section className="opt-section">
            <h3>錄影檔操作</h3>
            <ul>
              <li><strong>✂ 剪輯</strong>：去頭去尾，預設 stream copy 很快；要精準切到 frame 才需勾「精確剪切」</li>
              <li><strong>🔥 燒進字幕</strong>：把 SRT 永久燒進影片畫面，分享時不用額外字幕檔</li>
              <li><strong>開啟資料夾</strong>：跳到檔案所在目錄</li>
            </ul>
          </section>

          <section className="opt-section">
            <h3>排程錄影</h3>
            <p>⚙ 設定 → 排程錄影 → 新增。支援「一次性」「每日」「每週」三種，到時間自動開始/停止，使用主視窗目前的設定。app 必須保持開啟（可關到工作匣）。</p>
          </section>

          <section className="opt-section">
            <h3>工作匣 (Tray)</h3>
            <p>關閉視窗 ✕ 不會結束程式，會縮到工作匣繼續執行（排程才不會掉）。要徹底結束請在 Tray 圖示按右鍵 →「結束程式」。</p>
          </section>

          <section className="opt-section">
            <h3>疑難排解</h3>
            <ul>
              <li>錄影錯誤：展開下方 FFmpeg 日誌（複製全部）給開發者</li>
              <li>畫面卡頓：降低 FPS / 位元率，或切「速度優先」</li>
              <li>NVENC 失敗：升級 NVIDIA driver 到 570+ 或選 libx264 fallback</li>
              <li>STT 內容不對：把語言從「自動」改成「中文」、queue 改 5 秒、用 small 模型</li>
              <li>排程沒觸發：確認 app 在工作匣中 + 該排程是 enabled</li>
            </ul>
          </section>
        </div>
        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          <button className="btn btn-record" onClick={onClose}>
            知道了
          </button>
        </div>
      </div>
    </div>
  )
}
