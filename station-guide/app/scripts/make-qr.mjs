// QR 이미지를 만든다.
// - 개인 테스트: 인자 없이 실행하면 이 PC의 와이파이 주소(http://192.168.x.x:5180/)로 만든다 → 휴대폰으로 찍어 접속
// - 배포 후: npm run qr -- https://배포주소/
// 결과: docs/qr/station-guide-qr.png, .svg
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'

import { networkInterfaces } from 'node:os'

/** 사설망(와이파이) IPv4 주소 */
function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address)) return a.address
    }
  }
  return null
}

const arg = process.argv[2]
const lan = lanAddress()
const url = arg ?? (lan ? `http://${lan}:5180/` : null)
const ok = url && (/^https:\/\//.test(url) || /^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))[\d.]*(:\d+)?\//.test(url))
if (!ok) {
  console.error('usage: npm run qr [-- https://your-deployed-url/]  (no argument = this PC on Wi-Fi)')
  process.exit(1)
}
const dir = fileURLToPath(new URL('../../docs/qr/', import.meta.url))
mkdirSync(dir, { recursive: true })
// 오류 정정 수준 H: 스티커가 일부 긁히거나 가려져도 읽힌다
const opts = { errorCorrectionLevel: 'H', margin: 2, color: { dark: '#111827', light: '#ffffff' } }
await QRCode.toFile(dir + 'station-guide-qr.png', url, { ...opts, width: 1024 })
writeFileSync(dir + 'station-guide-qr.svg', await QRCode.toString(url, { ...opts, type: 'svg' }))
console.log(`QR for ${url} → ${dir}`)
