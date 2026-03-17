import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/inventario-materiais-pwa-v1/',
  plugins: [react()]
})