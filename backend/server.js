const express = require("express"); // membuat server
const cors = require("cors"); //biar frontend bisa akses backend ini
const multer = require("multer"); // biar backend bisa terima file upload
const path = require("path"); // bantu ambil ekstensi file
const { Pool } = require("pg"); // menghubungkan backend dengan postgre

const app = express(); // server ku namanya app
app.use(cors()); //website boleh mengirim request ke server ini

// ----------------- DATABASE -----------------
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "FinanceFlow",
  password: "amelcantik",
  port: 5432,
});
// format ID
// Generate ID format TRXDDMMYY + 6 digit
async function generateTransactionId(db) {
  // ambil nilai sequence berikutnya
  const seqRes = await db.query("SELECT nextval('trx_seq') AS seq");
  const seq = String(seqRes.rows[0].seq).padStart(6, "0");

  // tanggal hari ini → DDMMYY
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2); // ambil 2 digit akhir tahun

  return `TRX${dd}${mm}${yy}${seq}`;
}

// ----------------- tempat collect UPLOAD FILE -----------------
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// biar foto bisa diakses frontend
app.use("/uploads", express.static("uploads"));

// ----------------- ENDPOINTS -----------------
// saat buka localhost:5000 bakal mucul ini
app.get("/", (req, res) => {
  res.send("FinanceFlow backend running!");
});

// POST Transaction → simpan ke DB
app.post("/api/transactions", upload.single("receipt"), async (req, res) => {
  try {
    // 🔹 generate ID otomatis
    const id = await generateTransactionId(pool);
    const {
      type,
      amount,
      currency,
      date,
      category,
      party,
      description,
    } = req.body;

    const receipt_url = req.file ? `/uploads/${req.file.filename}` : null;
    const status = "Pending";
    const approved_by = null;
    const approved_at = null;

    const query = `
      INSERT INTO transactions (id, type, amount, currency, date, category, party, description, receipt_url, status, approved_by, approved_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $9, $10, $11, $12) RETURNING *;
    `;

    const values = [
      id,
      type,
      amount,
      currency,
      date,
      category,
      party,
      description,
      receipt_url,
      status,
      approved_by, 
      approved_at,
    ];

    const result = await pool.query(query, values);

    console.log("✔ Transaksi masuk DB:", result.rows[0]);

    res.json({ message: "Saved to DB!", transaction: result.rows[0], id });
  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ message: "DB Error", error: err.message });
  }
});

// endpoint PATCH (update status transaksi --> approval)
app.patch("/api/transactions/:id/approve", async (req, res) => {
  try {
    const {id} = req.params;
    const approved_by = "Admin";//nanti bisa diganti user login
    const approved_at = new Date();//tanggal/jam sekarang
    const status = "Completed";

    const query = `
      UPDATE transactions
      SET status = $1, approved_by = $2, approved_at = $3
      WHERE id = $4
      RETURNING *;
      `;
    const values = [status, approved_by, approved_at, id];
    const result = await pool.query(query, values);
    res.json({message: "Approved!", transaction: result.rows[0]});
  } catch (err){
    console.error("X approval error:", err);
    res.status(500).json({ message:"Approval failed", error: err.message });
  }
});
// Get semua transaksi
app.get("/api/transactions", async (req,res) =>{
  try{
    const result = await pool.query("SELECT * FROM transactions ORDER BY date DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({message: "DB Error", error: err.message});
  }
});

//masukin kategori dari database ke add transaction untuk milih kategori, tapi kategorinya ada yang untuk expense dan income, jadi nya beda
app.get("/api/categories/:type", async (req, res) => {
  try {
    const { type } = req.params;

    const result = await pool.query(
      `SELECT id, name
       FROM categories
       WHERE LOWER(type) = LOWER($1)
         AND is_active = TRUE
       ORDER BY name ASC`,
      [type]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      message: "DB Error",
      error: err.message
    });
  }
});


// ----------------- START SERVER -----------------
app.listen(5000, () => console.log("Server running on port 5000..."));
