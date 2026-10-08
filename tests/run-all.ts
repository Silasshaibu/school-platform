/** Runs every suite sequentially, each in its own process. */
import { execFileSync } from "child_process";

const suites = [
  "tenant", "webhook", "invoices", "reports", "admissions", "students", "auth",
];

let failed = 0;
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  try {
    execFileSync("npx", ["tsx", `tests/${s}.test.ts`], { stdio: "inherit" });
  } catch {
    failed++;
  }
}
console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
