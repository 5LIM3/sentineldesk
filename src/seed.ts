import "dotenv/config";
import { migrate, openDb } from "./db.js";

const db = openDb(process.env.DB_PATH ?? "./data/sentineldesk.db");
migrate(db);

// Seeding creates INITIAL demo data only. It is not a backup: if a host wipes the disk,
// the real records are gone and this script cannot bring them back (see README, "Hosting").
if ((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n > 0) {
  console.log("Database already has data; skipping seed.");
  process.exit(0);
}

// Dummy data only. password_hash is an unusable placeholder until bcrypt auth lands in Week 2.
const PLACEHOLDER_HASH = "!disabled-until-week-2";
const insertUser = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
const insertIncident = db.prepare(
  "INSERT INTO incidents (title, description, severity, status, created_by, assigned_to) VALUES (?, ?, ?, ?, ?, ?)"
);
const insertUpdate = db.prepare(
  `INSERT INTO incident_updates (incident_id, author_id, note, previous_status, new_status)
   VALUES (?, ?, ?, ?, ?)`
);

// Each incident's status equals the new_status of its last status-changing update (or 'open' if none),
// and every recorded change follows the transition rules in src/status.ts.
db.transaction(() => {
  insertUser.run("Ada Admin", "ada@example.com", PLACEHOLDER_HASH, "admin");
  insertUser.run("Tunde Analyst", "tunde@example.com", PLACEHOLDER_HASH, "analyst");
  insertUser.run("Chioma Analyst", "chioma@example.com", PLACEHOLDER_HASH, "analyst");

  // 1: investigating
  insertIncident.run("Repeated failed logins on VPN gateway", "Spike of failed logins from a single IP range overnight.", "high", "investigating", 2, 2);
  insertUpdate.run(1, 2, "Picked up at shift start. Reviewing VPN auth logs.", "open", "investigating");
  insertUpdate.run(1, 2, "Blocked offending IP range at the firewall. Monitoring.", null, null);

  // 2: open, no history yet
  insertIncident.run("Phishing email reported by finance", "Staff reported an invoice-themed email with a suspicious link.", "medium", "open", 3, null);

  // 3: contained
  insertIncident.run("Malware alert on workstation WS-014", "EDR flagged a suspicious process; host isolated.", "critical", "contained", 1, 3);
  insertUpdate.run(3, 3, "Taking ownership. Pulling EDR timeline.", "open", "investigating");
  insertUpdate.run(3, 3, "Host isolated from network; imaging disk for analysis.", "investigating", "contained");

  // 4: resolved
  insertIncident.run("Expired TLS certificate on internal portal", "Certificate expired; users saw browser warnings.", "low", "resolved", 2, 2);
  insertUpdate.run(4, 2, "Confirmed expired certificate on the portal.", "open", "investigating");
  insertUpdate.run(4, 2, "Renewed and deployed certificate; warnings gone.", "investigating", "resolved");
})();

console.log("Seeded 3 users, 4 incidents and 6 updates (dummy data).");
