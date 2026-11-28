import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** 개발 서버에서 /api/*를 배포용 함수와 같은 코드(server/routes.ts)로 처리한다 */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        let raw = ''
        for await (const chunk of req) raw += chunk
        let body: unknown = null
        try {
          body = raw ? JSON.parse(raw) : null
        } catch {
          /* 각 핸들러가 400으로 처리 */
        }
        const { handleApi } = await server.ssrLoadModule('/server/routes.ts')
        const path = '/api' + (req.url ?? '')
        const r = await handleApi(path, req.method ?? 'GET', body, { ...process.env, ...env })
        res.statusCode = r.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(r.body))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 프로젝트 루트(..)의 .env.local에서 서버 전용 키를 읽는다. VITE_ 접두사가 없으므로 브라우저 번들에는 들어가지 않는다.
  const env = loadEnv(mode, '..', '')
  return {
    plugins: [react(), devApi(env)],
    build: {
      rollupOptions: {
        output: {
          // 3D 라이브러리는 자주 안 바뀌므로 따로 묶어 브라우저 캐시를 오래 쓰게 한다
          manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei'] },
        },
      },
    },
  }
})
