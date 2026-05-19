# YC Screen Recorder

一個 Windows 桌面螢幕錄影 / 截圖工具，類似 Debut Pro，內建即時語音辨識（whisper）、排程錄影、區域錄影、字幕燒錄、簡易剪輯等功能。

採用 Electron + React + TypeScript + FFmpeg。

## 主要功能

- **多螢幕 / 區域 / 整個虛擬桌面**錄製，DXGI Desktop Duplication (ddagrab) GPU zero-copy
- **硬體編碼**：自動偵測 NVENC / Intel QSV / AMD AMF；fallback libx264
  - 三種畫質模式：速度優先 / 平衡 / 畫質優先
  - 位元率 0.2 Mbps 到 40 Mbps 八檔
- **音訊**：系統音 loopback + 麥克風混音，獨立音量控制 + VU meter
- **Webcam PiP** 疊加（dshow），4 角位置 + 大小可調
- **即時 STT 字幕**：whisper.cpp 在獨立 ffmpeg process 跑，輸出 SRT
- **排程錄影**：一次性 / 每日 / 每週，內建 `powerSaveBlocker`
- **暫停 / 續錄**：自動 concat MP4 + 合併 SRT
- **剪輯**：拖時間軸剪頭去尾，stream copy 或重新編碼
- **字幕燒錄**：把 SRT 永久燒進影片畫面
- **點擊高亮**：全域滑鼠點擊位置畫圓圈漣漪
- **全域熱鍵**：Ctrl+Shift+R 錄影、Ctrl+Shift+S 截圖
- **系統工作匣**：關視窗會縮到 Tray 而非結束
- **開機自動啟動** + 自動開始錄影

## 開發

### 系統需求

- Windows 10/11 x64
- Node.js 18+
- FFmpeg 8.0+（gyan.dev full build，含 `--enable-d3d11va --enable-nvenc --enable-libx264 --enable-whisper`）

### 安裝 FFmpeg

GitHub repo 不包含 FFmpeg 二進位（每個 ~213 MB 超過 GitHub 上限），請手動下載：

1. 從 <https://www.gyan.dev/ffmpeg/builds/> 下載 `ffmpeg-release-full.7z`
2. 解壓後，把 `bin/ffmpeg.exe` 與 `bin/ffprobe.exe` 複製到本專案的 `resources/ffmpeg/`

```
resources/
└── ffmpeg/
    ├── ffmpeg.exe
    └── ffprobe.exe
```

或用 winget 裝後從那邊複製：

```powershell
winget install Gyan.FFmpeg
Copy-Item "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-*-full_build\bin\ffmpeg.exe" resources\ffmpeg\
Copy-Item "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-*-full_build\bin\ffprobe.exe" resources\ffmpeg\
```

### 安裝相依套件

```bash
npm install
```

### 開發模式

```bash
npm run dev
```

### 打包 Windows 安裝檔

```bash
npm run build:win
```

成品在 `dist/yc-screen-recorder-<version>-setup.exe`。

## 架構

```
src/
├── main/                      # Electron main process
│   ├── index.ts               # window / tray / hotkey / protocols
│   ├── ipc.ts                 # all IPC handlers
│   ├── paths.ts               # ffmpeg / recordings paths
│   ├── preferences.ts         # JSON-backed prefs store
│   ├── audio-pipes.ts         # named-pipe servers for PCM IPC
│   ├── region-picker.ts       # full-screen overlay region picker
│   ├── scheduler.ts           # cron-like scheduling
│   ├── auto-launch.ts         # Windows login item
│   ├── click-highlight.ts     # uiohook + overlay windows
│   ├── burn-in.ts             # subtitle burn-in side ffmpeg
│   ├── trim.ts                # video trimming side ffmpeg
│   ├── recorder/
│   │   ├── session.ts         # main recording state machine
│   │   ├── ffmpeg-args.ts     # ffmpeg command builders
│   │   ├── encoder-probe.ts   # encoder availability + quality presets
│   │   ├── display-map.ts     # ddagrab output_idx ↔ Electron display
│   │   └── dshow-devices.ts   # webcam enumeration
│   └── stt/
│       ├── models.ts          # whisper model downloader
│       ├── transcript-watch.ts
│       └── srt-merge.ts
├── preload/                   # contextBridge typed API
└── renderer/                  # React UI
    └── src/
        ├── App.tsx            # main / region-picker / click-overlay routing
        ├── store.ts           # zustand store + prefs sync
        ├── audio/             # WebAudio capture (system + mic)
        └── components/        # ~20 React components
```

## 已知限制

- 只支援 Windows（macOS / Linux 缺 ddagrab + dshow 等價）
- FFmpeg GPL build：若要商用閉源需改用 LGPL build 並放棄 NVENC
- whisper 模型 ~150–500 MB，首次啟用 STT 才下載
- NVENC 需 NVIDIA driver 570+，否則 fallback libx264 CPU 編碼

## License

私人專案，未授權。
