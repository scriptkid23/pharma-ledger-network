'use strict';

const express = require('express');
const axios = require('axios');
const app = express();
const sql = require('mssql');
const path = require('path');
const cors = require('cors');

const ip = require('../config-network.json');
// Cấu hình SQL Server

const config = {
    user: 'sa',
    password: 'nckhabc123!',
    server: ip.host, // dùng IP từ file config
    database: 'nckhdb',
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};


const conn = new sql.ConnectionPool(config).connect().then(pool => pool);
const PORT = 3000;
app.use(cors({ origin: `http://${ip.host}:${ip.frontend}` }));

// Cấu hình Fablo REST
const FABLO_REST_URL = `http://${ip.host}:${ip.fablo}`;
let AUTH_TOKEN = "";

app.use(express.json());

console.log(`
    ✅ frontend running at http://${ip.host}:${ip.frontend}
    ✅ backend running at http://${ip.host}:${ip.backend}
    ✅ fablo running at http://${ip.host}:${ip.fablo}
    `)
// ✅ API createMedicine (POST)
app.post('/api/createMedicine', async (req, res) => {
  // Extract token from request body, sent by frontend
  const {medicineId, batchId, manufacturerId, productionDate, expiryDate, quantity, token } = req.body;
  if (!medicineId || !batchId || !manufacturerId || !quantity) {
    return res.status(400).json({ error: "Missing required fields for medicine creation" });
  }
  if (!token) {
    return res.status(400).json({ error: "Missing authentication token" });
  }

  console.log("Received createMedicine request with token:", token); // Log received token for debugging
  try {
    const response = await axios.post(
      // Use the correct Fablo REST endpoint for the manufacturer organization
      `http://${ip.host}:${ip.fablo}/invoke/channel/transfer`, // Assuming ip.fablo points to manufacturer's REST port (8801)
      {
        method: "SupplyChainContract:createMedicine",
        args: [
            medicineId,
            batchId,
            manufacturerId,
            productionDate,
            expiryDate,
            quantity.toString()  // Ensure quantity is a string
        ]
      },
      {
        headers: {
          // Use the token provided by the frontend request
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.json(response.data);
    console.log("Medicine created successfully:", response.data);
  } catch (error) {
    // Log detailed error information
    console.error("Error creating medicine:", error.response ? error.response.data : error.message);
    res.status(error.response ? error.response.status : 500).json({ 
        error: "Failed to create medicine on the ledger", 
        details: error.response ? error.response.data : error.message 
    });
  }
});


app.post('/api/getAllMedicineCreate', async (req, res) => {
    try {
        const response = await axios.post(`http://${ip.host}:${ip.fablo}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getAllMedicines",
            args: []
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
})

app.post('/api/getMedicineByLogId', async (req, res) => {
    const { logId } = req.body;
    console.log(req.body)
    try {
        const response = await axios.post(`http://${ip.host}:${ip.fablo}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getMedicineBylogId",
            args: [logId]
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
})

async function updateAuthToken() {
    try {
        const result = await axios.post(`${FABLO_REST_URL}/user/enroll`, {
            id: "admin",
            secret: "adminpw"
        }, {
            headers: { "Content-Type": "application/json" }
        });

        AUTH_TOKEN = result.data.token;
        console.log("🔑 Token updated:", AUTH_TOKEN);
    } catch (error) {
        console.error("❌ Lỗi khi lấy token:", error.message);
    }
}

app.post('/api/Inbound', async (req, res) => {
    const { logId, transferCompanyId, fromId, toId, quantity, token } = req.body;
    console.log(req.body)
    try {
        const response = await axios.post(`http://${ip.host}:${ip.fablo}/invoke/channel/transfer`, {
            method: "SupplyChainContract:transferQuantity",
            //parentLogId, fromId, toId, quantity, price
            args: [logId, fromId, toId, transferCompanyId, quantity.toString()]
        }, {
                headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
})

// Gọi ngay khi server khởi động
updateAuthToken();

// Lặp lại mỗi 10 phút
setInterval(updateAuthToken, 10 * 60 * 1000);


// ✅ API getMedicine
app.post('/getMedicine/:medicineId/:batchId', async (req, res) => { // ma thuoc voi lo
    const { medicineId, batchId } = req.params;

    try {
        const response = await axios.post(`${FABLO_REST_URL}/query/mychannel/supplychain`, {
            method: "SupplyChainContract:getMedicine",
            args: [medicineId, batchId]
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: error.message });
    }
});

// ✅ API enroll lấy token
app.post('/get-token', async (req, res) => {
    try {
        const result = await axios.post(`${FABLO_REST_URL}/user/enroll`, {
            id: "admin",
            secret: "adminpw"
        }, {
            headers: { "Content-Type": "application/json" }
        });

        res.json({ token: result.data.token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ✅ Truy vấn SQL (test)
app.get('/api/getThuoc/:maThuoc', async (req, res) => {
    try {
        const maThuoc = req.params.maThuoc;

        const pool = await conn;
        const result = await pool
            .request()
            .input('maThuoc', sql.VarChar, maThuoc) // truyền tham số maThuoc
            .query('SELECT * FROM THUOC WHERE MaThuoc = @maThuoc'); // truy vấn có điều kiện

        res.json(result.recordset);
    } catch (err) {
        console.error('❌ SQL error:', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server' });
    }
});

app.get('/api/getNhaSanXuat', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.request().query('SELECT * FROM NHA_SX');
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ SQL error:', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server' });
    }
})

app.get('/api/getNhaPhanPhoi', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.request().query('SELECT * FROM PP');
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ SQL error:', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server' });
    }
})

app.get('/api/getNhaThuoc', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.request().query('SELECT * FROM NHA_THUOC');
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ SQL error:', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server' });
    }
});

app.post('/api/getThuoc', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool
            .request()
            .query(`
                SELECT *
                FROM THUOC T
                JOIN BQ B ON T.MA_BQ = B.MA_BQ
            `);

        res.json(result.recordset);
    } catch (err) {
        console.error('❌ SQL error:', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server' });
    }
});




app.listen(3001);


