// setup_database.js
const sqlite3 = require('sqlite3').verbose();

// Connect to or create the database file
// './inventory.db' specifies the database file name and location (in the current directory)
const db = new sqlite3.Database('./inventory.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to the inventory database.');
    }
});

db.serialize(() => {
    // SQL query to create the 'inventory' table
    // IF NOT EXISTS ensures it only creates the table if it doesn't already exist
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemName TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        category TEXT NOT NULL
    )`, (err) => {
        if (err) {
            console.error("Error creating table:", err.message);
        } else {
            console.log("Inventory table created or already exists.");
        }
    });

    // Insert some initial data into the inventory table
    // This will only insert if the items don't already exist or if the table was empty.
    // If you run this multiple times without clearing the table, it might add duplicates
    // or just not insert if a UNIQUE constraint was added. For simplicity, we'll let it try.
    const initialData = [
        ["Painkillers", 5, "med"],
        ["Cotton", 15, "First-aid"],
        ["Dettol", 2, "antiseptic"],
        ["Sar Dard", 0, "daily"],
        ["Cotton Bandage", 4, "first-aid"],
        ["Bandage", 41, "First-aid"],
        ["Syringes", 50, "disposable"],
        ["Gloves", 100, "PPE"]
    ];

    // Using a prepared statement for efficient insertion
    const stmt = db.prepare("INSERT INTO inventory (itemName, quantity, category) VALUES (?, ?, ?)");
    initialData.forEach(item => {
        stmt.run(item, function(err) {
            if (err) {
                // Log specific error for duplicate entries, if desired
                if (err.message.includes("SQLITE_CONSTRAINT")) {
                    // console.warn(`Item '${item[0]}' might already exist.`);
                } else {
                    console.error(`Error inserting ${item[0]}:`, err.message);
                }
            }
        });
    });
    stmt.finalize(() => { // Finalize closes the prepared statement
        console.log("Initial inventory data insertion attempt completed.");
        // Close the database connection after all operations are done
        db.close((err) => {
            if (err) {
                console.error('Error closing database after setup:', err.message);
            } else {
                console.log('Database setup connection closed.');
            }
        });
    });
});