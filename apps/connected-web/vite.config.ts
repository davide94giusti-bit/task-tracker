import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({root:path.resolve(import.meta.dirname),base:'/',plugins:[react()],publicDir:'public',build:{outDir:path.resolve(import.meta.dirname,'../../dist-connected'),emptyOutDir:true,chunkSizeWarningLimit:650},resolve:{alias:{'@connected-contracts':path.resolve(import.meta.dirname,'../../packages/connected-contracts/index.ts')}}});
