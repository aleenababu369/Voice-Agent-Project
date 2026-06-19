import { buildApp } from "./app.ts";

const port = Number(process.env.PORT ?? 5005);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp();

try {
  await app.listen({ port, host });
  console.log(`Voice agent API listening on http://${host}:${port}`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
