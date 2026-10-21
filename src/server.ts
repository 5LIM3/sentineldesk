import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { migrate, openDb } from "./db.js";

const config = loadConfig(); // exits with a clear message if JWT_SECRET is not set
const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DB_PATH ?? "./data/sentineldesk.db");
migrate(db);

createApp(db, config).listen(port, () => {
  console.log(`SentinelDesk API listening on port ${port}`);
});
