import { defineConfig } from 'vitest/config'

// 정확도 측정용(느림, 네트워크로 인식 데이터를 받을 수 있음). 일반 테스트와 분리한다.
export default defineConfig({ test: { include: ['eval/**/*.eval.ts'], testTimeout: 300_000 } })
