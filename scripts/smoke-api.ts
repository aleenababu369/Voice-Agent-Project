import { buildApp } from "../apps/api/src/app.ts";

const app = buildApp();

try {
  await app.listen({ port: 8091, host: "127.0.0.1" });
  const response = await fetch("http://127.0.0.1:8091/health");
  const body = await response.json();
  console.log(JSON.stringify(body));
} finally {
  await app.close();
}
