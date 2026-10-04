import 'dotenv/config';
import { createApp } from './app';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerIds } from '../src/providers';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3001);
const app = createApp({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  baseURL: process.env.OPENAI_BASE_URL,
  configPath: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../branchboard.providers.json',
  ),
  providers: Object.fromEntries(
    providerIds.map((id) => {
      const prefix = id.toUpperCase();
      return [
        id,
        {
          apiKey: process.env[`${prefix}_API_KEY`],
          baseURL: process.env[`${prefix}_BASE_URL`],
          model: process.env[`${prefix}_MODEL`],
        },
      ];
    }),
  ),
});
app.listen(port, host, () => console.log(`Branchboard API ready on http://${host}:${port}`));
