import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixDB() {
  try {
    const res = await pool.query("SELECT value FROM kv_store WHERE key = 'tierlist_users'");
    if (res.rows.length > 0) {
      let users = res.rows[0].value;
      if (typeof users === 'string') users = JSON.parse(users);
      
      let fixed = false;
      const newUsers = {};
      
      for (const [uid, userData] of Object.entries(users)) {
        let isBad = false;
        
        // Check if any item in the S tier doesn't end with .webp
        if (userData.tierList && userData.tierList.S) {
           for (const item of userData.tierList.S) {
             if (!item.endsWith('.webp')) {
               isBad = true;
               break;
             }
           }
        }
        // If it's a "truth" payload but no tierList, that's fine.
        // We check the first item in unranked just to be sure
        if (!isBad && userData.tierList && userData.tierList.unranked) {
            for (const item of userData.tierList.unranked) {
                if (!item.endsWith('.webp')) {
                    isBad = true;
                    break;
                }
            }
        }

        if (isBad) {
          console.log(`Deleting bad user: ${uid}`);
          fixed = true;
        } else {
          newUsers[uid] = userData;
        }
      }
      
      if (fixed) {
        await pool.query(
          "UPDATE kv_store SET value = $1 WHERE key = 'tierlist_users'",
          [JSON.stringify(newUsers)]
        );
        console.log('Database fixed successfully!');
      } else {
        console.log('No bad users found in database.');
      }
    } else {
        console.log('No users found in database.');
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

fixDB();
