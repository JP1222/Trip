import { closeDatabase, migrateDatabase } from "../src/lib/db";

async function main(): Promise<void> {
  const result = await migrateDatabase();
  console.info(
    `[database] migrations complete; applied=${result.applied.join(",") || "none"} skipped=${result.skipped.join(",") || "none"}`,
  );
}

main()
  .catch((error) => {
    console.error("[database] migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
