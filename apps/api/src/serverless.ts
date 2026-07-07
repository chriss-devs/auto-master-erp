import 'reflect-metadata';
import type { Express } from 'express';
import { createApp } from './bootstrap';

// Bootstrap cacheado entre invocaciones (Vercel serverless, BL-018)
let server: Express | null = null;

export async function getServer(): Promise<Express> {
  if (!server) {
    const app = await createApp();
    await app.init();
    server = app.getHttpAdapter().getInstance() as Express;
  }
  return server;
}
