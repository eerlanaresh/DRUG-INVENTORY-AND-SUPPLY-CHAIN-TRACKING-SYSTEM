// certification_api_fix.js (Modified with Inventory APIs)

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs=require('fs')

const app = express();
const port = 3000;

const inventoryDb = new sqlite3.Database('./inventory.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
const trackingDb = new sqlite3.Database('./tracking.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
const salesDb = new sqlite3.Database('./sales.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
const certificationsDb = new sqlite3.Database('./certifications.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
const trainingDb = new sqlite3.Database('./training_schedule.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
const feedbackDb = new sqlite3.Database('./feedback.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// HTML routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/verification.html', (req, res) => res.sendFile(path.join(__dirname, 'verification.html')));
app.get('/inventory.html', (req, res) => res.sendFile(path.join(__dirname, 'inventory.html')));

// Login and logout
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'user@example.com' && password === 'password123') {
        res.redirect('/dashboard.html');
    } else {
        res.redirect('/index.html?error=invalid_credentials');
    }
});
app.post('/logout', (req, res) => res.status(200).json({ message: 'Logged out successfully.' }));

// ✅ CERTIFICATION VERIFICATION API
app.post('/api/verify_certification', (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ success: false, message: 'Certification code is required.' });
    }

    certificationsDb.get(
        `SELECT code, issueDate, expiryDate, status FROM certification_codes WHERE code = ?`,
        [code],
        (err, row) => {
            if (err) {
                console.error('Error verifying code:', err.message);
                return res.status(500).json({ success: false, message: 'Database error' });
            }

            if (!row) {
                return res.status(404).json({ success: false, message: 'Code not found.' });
            }

            return res.status(200).json({
                success: true,
                message: 'Code verified successfully.',
                details: row,
            });
        }
    );
});

// ✅ INVENTORY API ROUTES

// GET all inventory items (with optional search)
app.get('/api/inventory', (req, res) => {
    let searchTerm = req.query.search || '';
    const query = searchTerm
        ? `SELECT * FROM inventory WHERE itemName LIKE ? OR category LIKE ?`
        : `SELECT * FROM inventory`;

    const params = searchTerm ? [`%${searchTerm}%`, `%${searchTerm}%`] : [];

    inventoryDb.all(query, params, (err, rows) => {
        if (err) {
            console.error('Error fetching inventory:', err.message);
            return res.status(500).json({ error: 'Internal server error' });
        }
        res.json(rows);
    });
});

// POST: Add new inventory item
app.post('/api/inventory', (req, res) => {
    const { itemName, quantity, category } = req.body;

    if (!itemName || quantity == null || !category) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    inventoryDb.run(
        `INSERT INTO inventory (itemName, quantity, category) VALUES (?, ?, ?)`,
        [itemName, quantity, category],
        function (err) {
            if (err) {
                console.error('Error inserting inventory:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(201).json({ id: this.lastID, itemName, quantity, category });
        }
    );
});

// DELETE: Remove inventory item by ID
app.delete('/api/inventory/:id', (req, res) => {
    const id = req.params.id;

    inventoryDb.run(`DELETE FROM inventory WHERE id = ?`, [id], function (err) {
        if (err) {
            console.error('Error deleting inventory:', err.message);
            return res.status(500).json({ error: 'Failed to delete item' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.status(200).json({ message: 'Item deleted' });
    });
});
app.get('/api/sales_demand', (req, res) => {
    salesDb.all(`SELECT * FROM sales_demand`, [], (err, rows) => {
        if (err) {
            console.error('Error fetching sales data:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }

        // Structure: { itemName: [monthlyData], ... }
        const demandData = {};
        rows.forEach(row => {
            if (!demandData[row.itemName]) {
                demandData[row.itemName] = Array(12).fill(0);
            }
            demandData[row.itemName][row.month - 1] = row.demand;
        });

        res.json(demandData);
    });
});
// ✅ TRACKING API: Fetch tracking data by orderId
app.get('/api/track_order', (req, res) => {
    const orderId = req.query.orderId;

    if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
    }

    trackingDb.get(`SELECT * FROM tracking WHERE orderId = ?`, [orderId], (err, row) => {
        if (err) {
            console.error('Error fetching tracking data:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        if (!row) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Convert status to a code
        const statusMap = {
            'Placed': 'placed',
            'Shipped': 'shipped',
            'Out for Delivery': 'out_for_delivery',
            'Delivered': 'delivered'
        };

        const status_code = statusMap[row.status] || 'placed';
        let details = [];

        try {
            details = JSON.parse(row.details);
        } catch (e) {
            details = [];
        }

        res.json({
            orderId: row.orderId,
            itemName: row.itemName,
            quantity: row.quantity,
            status: row.status,
            status_code,
            estimatedDelivery: row.estimatedDelivery,
            details
        });
    });
});
app.post('/api/book_training', (req, res) => {
    const { date, time } = req.body;
    if (!date || !time) {
        return res.status(400).json({ error: 'Date and time are required' });
    }
    trainingDb.run(`INSERT INTO sessions (date, time) VALUES (?, ?)`, [date, time], function (err) {
        if (err) {
            console.error('Error booking training session:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ success: true, message: 'Training session booked successfully!' });
    });
});
app.post('/api/chatbot', (req, res) => {
  const { message } = req.body;

  let reply;

  if (!message) {
    return res.status(400).json({ reply: "Please type a message." });
  }

  // Simple keyword-based responses
  const lower = message.toLowerCase();

  if (lower.includes('training')) {
    reply = "You can find training modules in the Training tab. We offer Inventory, Supply Chain, and Drug Disposal guidance.";
  } else if (lower.includes('book') || lower.includes('session')) {
    reply = "To book a session, go to the Staff Training section and select a date and time.";
  } else if (lower.includes('certificate')) {
    reply = "Certificates will be available after you complete all training modules.";
  } else if (lower.includes('hello') || lower.includes('hi')) {
    reply = "Hello! How can I help you today?";
  } else {
    reply = "I'm here to assist with training, booking, and general help. Try asking about modules or booking a session.";
  }

  res.json({ reply });
});
app.post('/api/submit_feedback', (req, res) => {
  const { rating, feedback } = req.body;

  if (!rating && !feedback) {
    return res.status(400).json({ success: false, message: 'Please provide feedback or rating.' });
  }

  const fs = require('fs');
  const entry = `[${new Date().toISOString()}] Rating: ${rating || 'N/A'}, Feedback: ${feedback || 'N/A'}\n`;

  fs.appendFile('feedback_log.txt', entry, (err) => {
    if (err) {
      console.error('❌ Error saving feedback:', err);
      return res.status(500).json({ success: false, message: 'Failed to save feedback.' });
    }
    res.status(200).json({ success: true, message: '✅ Feedback received. Thank you!' });
  });
});
app.post('/api/submit_feedback', (req, res) => {
  const { rating, feedback } = req.body;

  if (!rating && !feedback) {
    return res.status(400).json({ success: false, message: 'Please provide feedback or rating.' });
  }

  const submittedAt = new Date().toISOString();

  feedbackDb.run(
    `INSERT INTO feedback (rating, comment, submitted_at) VALUES (?, ?, ?)`,
    [rating || null, feedback || '', submittedAt],
    function(err) {
      if (err) {
        console.error('❌ Failed to save feedback:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to save feedback.' });
      }

      res.status(200).json({ success: true, message: '✅ Feedback submitted successfully!' });
    }
  );
});
app.post('/logout', (req, res) => {
    res.clearCookie('sessionId'); // if you're using cookies to store session info
    res.redirect('/index.html');  // redirect to the homepage or login page
});
// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
