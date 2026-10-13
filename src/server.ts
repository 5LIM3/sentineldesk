import "dotenv/config";
import { createApp } from "./app.js";
import { migrate, openDb } from "./db.js";

const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DB_PATH ?? "./data/sentineldesk.db");
migrate(db);

createApp(db).listen(port, () => {
  console.log(`SentinelDesk API listening on port ${port}`);
  console.warn(
    "WARNING: Week 1 build has NO authentication. created_by / author_id come from the request body " +
      "and are not a trusted identity. Use dummy data only; do not expose this publicly."
  );
});
