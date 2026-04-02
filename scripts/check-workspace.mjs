import { existsSync } from "node:fs";

const requiredPaths = [
  "README.md",
  "docs/architecture.md",
  "docs/implementation-roadmap.md",
  "apps/api/src/index.ts",
  "apps/api/src/app.ts",
  "apps/admin/index.html",
  "packages/contracts/src/index.ts",
  "infra/docker-compose.yml"
];

const missing = requiredPaths.filter((path) => !existsSync(path));

if (missing.length > 0) {
  console.error("Workspace check failed. Missing:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("Workspace check passed.");
