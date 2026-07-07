import 'reflect-metadata';
import { createApp } from './bootstrap';

async function main() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`API Auto Master en :${port} (/api/v1)`);
}

void main();
