// File: test/unescaped-chars-test.mjs
import { bindConfig } from '../client/index.mjs'
import assert from 'assert'

// NOTE: This test checks if view queries handle special characters
// in keys (like |, #, non-ASCII) correctly without throwing
// ERR_UNESCAPED_CHARACTERS.

async function runTest() {
  const dbName = 'test_unescaped_chars' // Use a dedicated test DB
  const couchUrl = `http://admin:admin@localhost:5984/${dbName}`
  const config = { couch: couchUrl }
  const db = bindConfig(config)

  console.log(`Configured to use CouchDB at: http://localhost:5984/${dbName}`)

  // Ensure the database exists
  try {
    await db.getDBInfo()
    console.log(`Database '${dbName}' exists.`)
  } catch (err) {
     if (err.message?.includes('Database does not exist')) {
       console.warn(`Database '${dbName}' does not exist. Attempting to create...`);
       try {
         // Use fetch to create DB as hide-a-bed doesn't have createDB
         const createResp = await fetch(couchUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}` }
         });
         if (!createResp.ok) {
            throw new Error(`Failed to create DB: ${createResp.statusText}`);
         }
         console.log(`Database '${dbName}' created successfully.`);
       } catch (createErr) {
          console.error("Error creating database:", createErr);
          console.log("Please ensure the database exists manually.");
          return;
       }
     } else {
        console.error("Error checking database:", err);
        return;
     }
  }

  // Define a dummy view (doesn't need to actually exist for this URL test)
  const viewPath = '_design/test/_view/by_special_key';
  // Define a key with special characters
  const specialKey = ["user_1", "prefix|value\ufff0"]; // Using | and a non-ASCII char

  console.log(`Attempting query with special key: ${JSON.stringify(specialKey)}`)

  try {
    // Attempt the query using the special key in startkey
    const results = await db.query(viewPath, {
      startkey: specialKey,
      limit: 1
    });

    // If we get here, the URL was constructed correctly (no ERR_UNESCAPED_CHARACTERS)
    console.log('TEST PASSED: Query executed without ERR_UNESCAPED_CHARACTERS.');
    console.log(`Query results received (rows: ${results?.rows?.length ?? 0})`);
    // We don't care about the actual results, just that the request didn't fail due to URL format.
    console.log('TEST PASSED: Query executed without ERR_UNESCAPED_CHARACTERS.');
    console.log(`Query results received (rows: ${results?.rows?.length ?? 0})`);
    // We don't care about the actual results, just that the request didn't fail due to URL format.
    assert.ok(true, "Query executed successfully without URL format error");

  } catch (error) {
    // Check if the error is the expected 'not_found' from CouchDB because the view doesn't exist
    if (error.message?.includes('not_found')) {
       console.log(`TEST PASSED: Query executed without ERR_UNESCAPED_CHARACTERS, received expected 'not_found' from CouchDB.`);
       assert.ok(true, "Query executed successfully, received expected 'not_found'");
    } else if (error.code === 'ERR_UNESCAPED_CHARACTERS') {
       // This is the specific error we were fixing
       console.error('TEST FAILED: Failure was due to ERR_UNESCAPED_CHARACTERS. Fix did not work.', error);
       assert.fail('Query failed due to ERR_UNESCAPED_CHARACTERS.');
    } else {
       // Any other error is unexpected
       console.error('TEST FAILED: Query failed with an unexpected error.', error);
       assert.fail(`Query failed with unexpected error: ${error.message}`);
    }
  }

  // Optional: Clean up database (requires admin privileges)
  // try {
  //   console.log(`Attempting to delete database '${dbName}'...`);
  //   const deleteResp = await fetch(couchUrl, {
  //     method: 'DELETE',
  //     headers: { 'Authorization': `Basic ${Buffer.from('admin:admin').toString('base64')}` }
  //   });
  //   if (!deleteResp.ok) {
  //     throw new Error(`Failed to delete DB: ${deleteResp.statusText}`);
  //   }
  //   console.log(`Database '${dbName}' deleted successfully.`);
  // } catch (deleteErr) {
  //   console.error("Error deleting database:", deleteErr);
  // }

  console.log('Test script finished.')
}

runTest().catch(console.error)
