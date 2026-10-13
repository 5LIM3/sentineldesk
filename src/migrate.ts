import "dotenv/config";
import { migrate, openDb } from "./db.js";

migrate(openDb(process.env.DB_PATH ?? "./data/sentineldesk.db"));
console.log("Migrations up to date");
