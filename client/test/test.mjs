import tap from "tap";
import { spawn } from "child_process";
import { bindConfig } from '../index.mjs'

const PORT = 8984;
const DB_URL = `http://localhost:${PORT}/testdb`;
let server;

tap.before(async () => {
  console.log("Starting PouchDB Server...");

  server = spawn("pouchdb-server", ["--in-memory", "--port", PORT.toString()], {
    stdio: "inherit",
  });

  await new Promise((resolve) => setTimeout(resolve, 6000)); // Give it time to start

  console.log("PouchDB Server started on", DB_URL);
});

tap.test("PouchDB can create and fetch a document", async (t) => {
  const config = { couch: DB_URL, bindWithRetry: true }
  const db = bindConfig(config)

  console.log('calling')
  const doc = await db.put({ _id: "testdoc", data: "hello world" });
  console.log(doc)
  t.ok(doc.ok, "Document created");

  const fetched = await db.get("testdoc");
  t.equal(fetched.data, "hello world", "Fetched document matches");
});

tap.after(() => {
  console.log("Shutting down PouchDB Server...");
  server.kill();
});
