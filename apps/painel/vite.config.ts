import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // PROXY: o navegador chama /api no MESMO endereço do painel (localhost:5173)
    // e o Vite repassa para a API (localhost:3333). Para o navegador, é tudo uma origem só.
    proxy: {
      '/api': { target: 'http://localhost:3333', xfwd: true },
    },
  },
});
