'use strict';

const express = require('express');
const axios = require('axios');
const app = express();
const sql = require('mssql');
const path = require('path');
const cors = require('cors');
// const jwt = require('jsonwebtoken');

// --- Cấu hình và Khởi tạo chung --- 

// Import cấu hình IP từ file config-network.json
const ip = require('../config-network.json'); // Đảm bảo đường dẫn chính xác. Lưu ý: Đường dẫn này có thể cần điều chỉnh nếu file server.js không nằm cùng cấp với config-network.json

// Cấu hình SQL Server
const config = {
    user: 'sa',
    password: 'nckhabc123!',
    server: ip.host, // Sử dụng IP từ file config
    database: 'nckhdb',
    port: 1433,
    options: {
        encrypt: false, // Để cho môi trường phát triển (có thể cần true cho production)
        trustServerCertificate: true // Tin tưởng chứng chỉ máy chủ
    }
};

// Kết nối đến SQL Server pool
const conn = new sql.ConnectionPool(config).connect().then(pool => {
    console.log('Connected to SQL Server');
    return pool;
}).catch(err => {
    console.error('Failed to connect to SQL Server:', err);
    process.exit(1); // Thoát ứng dụng nếu không thể kết nối DB
});

const PORT = 3001; // Cổng cho backend server (Nếu bạn muốn dùng 3000, hãy điều chỉnh trong config-network.json)
app.use(cors({ origin: `http://${ip.host}:${ip.frontend}` })); // Cho phép CORS từ frontend

// Cấu hình Fablo REST API URL
const FABLO_REST_URL = `http://${ip.host}:`; // Giữ lại chỉ host và dấu hai chấm

let AUTH_TOKEN = ""; // Biến toàn cục để lưu token admin

app.use(express.json()); // Middleware để phân tích cú pháp JSON trong request body

console.log(`
    Frontend running at http://${ip.host}:${ip.frontend}
    Backend running at http://${ip.host}:${ip.backend} (Port: ${PORT})
    Fablo REST API at http://${ip.host}:${ip.fablo}
`);

// --- Hàm hỗ trợ chung ---
/**
 * Cập nhật AUTH_TOKEN bằng cách gọi Fablo REST /user/enroll.
 * Token này thường là token của admin để thực hiện các truy vấn chung.
 */
async function updateAuthToken() {
    try {
        // Sử dụng cổng fablo cho admin token
        const result = await axios.post(`${FABLO_REST_URL}${ip.fablo}/user/enroll`, {
            id: "admin",
            secret: "adminpw"
        }, {
            headers: { "Content-Type": "application/json" }
        });
        AUTH_TOKEN = result.data.token;
        console.log("Token admin đã được cập nhật.");
    } catch (error) {
        console.error("Lỗi khi lấy token admin:", error.message);
    }
}

// Gọi ngay khi server khởi động để có token ban đầu
updateAuthToken();
// Lặp lại mỗi 10 phút để đảm bảo token luôn hợp lệ
setInterval(updateAuthToken, 10 * 60 * 1000);


/**
 * Helper function để gọi smart contract getAllMedicines và xử lý payload.
 * Giúp các hàm khác tránh lặp lại logic gọi API và parse JSON.
 * @param {string} token - Token xác thực để gọi smart contract.
 * @param {string} port - Cổng Fablo REST API cụ thể cho vai trò gọi (ví dụ: ip.fablo, ip.pharmacy, ip.storagea, ip.storageb).
 * @returns {Array<Object>} - Mảng các bản ghi thuốc từ sổ cái.
 * @throws {Error} - Ném lỗi nếu có vấn đề khi gọi API hoặc parse dữ liệu.
 */
async function _fetchAndParseAllMedicinesFromLedger(token, port) {
    try {
        console.log(`Debug: Calling Fablo REST at ${FABLO_REST_URL}${port}/invoke/channel/transfer`);
        const response = await axios.post(`${FABLO_REST_URL}${port}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getAllMedicines",
            args: []
        }, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        let allMedicinesRaw;
        // Ưu tiên response.data.result.payload (cấu trúc phổ biến cho invoke/query)
        if (response.data && response.data.result && response.data.result.payload) {
            allMedicinesRaw = response.data.result.payload;
        } 
        // Sau đó kiểm tra response.data.response (cấu trúc bạn vừa gặp)
        else if (response.data && response.data.response) {
            allMedicinesRaw = response.data.response;
        }
        // Tiếp theo, kiểm tra response.data.payload
        else if (response.data && response.data.payload) {
            allMedicinesRaw = response.data.payload;
        }
        // Cuối cùng, thử response.data trực tiếp
        else if (response.data) {
            allMedicinesRaw = response.data;
        }

        let parsedMedicines;
        if (typeof allMedicinesRaw === 'string') {
            try {
                parsedMedicines = JSON.parse(allMedicinesRaw);
            } catch (e) {
                console.error("Lỗi phân tích JSON từ getAllMedicines (Payload):", e.message);
                throw new Error("Dữ liệu payload từ smart contract không hợp lệ (không phải JSON hợp lệ).");
            }
        } else if (Array.isArray(allMedicinesRaw)) {
            parsedMedicines = allMedicinesRaw;
        } else {
            console.error(`Dữ liệu từ smart contract không ở định dạng mong muốn: ${typeof allMedicinesRaw}, value: ${JSON.stringify(allMedicinesRaw)}`);
            throw new Error("Dữ liệu từ smart contract không ở định dạng mong muốn (không phải chuỗi JSON hoặc mảng).");
        }

        if (!Array.isArray(parsedMedicines)) {
            console.error(`Lỗi: Dữ liệu sau khi parse không phải là mảng: ${typeof parsedMedicines}`);
            throw new Error("Dữ liệu trả về từ smart contract không phải là mảng.");
        }

        return parsedMedicines;

    } catch (error) {
        console.error("Lỗi khi lấy tất cả thuốc từ ledger:", error.message);
        throw new Error(`Không thể truy xuất tất cả bản ghi thuốc từ ledger: ${error.message}`);
    }
}


// --- API Chung (Có thể sử dụng bởi nhiều vai trò hoặc Admin) ---

/**
 * API lấy token cho người dùng cụ thể (admin/manufacturer/pharmacy/storagea/storageb).
 * @route POST /api/get-user-token
 * @body {string} id - ID người dùng (ví dụ: "admin", "manufacturer.admin", "pharmacy.user")
 * @body {string} secret - Mật khẩu người dùng (ví dụ: "adminpw", "manufacturer.adminpw", "pharmacy.userpw")
 */
app.post('/api/get-user-token', async (req, res) => {
    const { id, secret } = req.body;
    if (!id || !secret) {
        return res.status(400).json({ error: "Missing user ID or secret for token enrollment" });
    }
    try {
        const result = await axios.post(`${FABLO_REST_URL}${ip.fablo}/user/enroll`, { // Sử dụng cổng fablo cho get-user-token
            id: id,
            secret: secret
        }, {
            headers: { "Content-Type": "application/json" }
        });
        console.log(`Đã lấy token cho người dùng: ${id}`);
        res.json({ token: result.data.token });
    } catch (err) {
        console.error("Lỗi khi lấy token cho người dùng:", err.response ? err.response.data : err.message);
        res.status(err.response ? err.response.status : 500).json({ 
            error: "Failed to get user token", 
            details: err.response ? err.response.data : err.message 
        });
    }
});

/**
 * API truy xuất tất cả các bản ghi thuốc và giao dịch từ sổ cái.
 * Endpoint này sử dụng AUTH_TOKEN (admin token) để có quyền truy cập toàn bộ ledger.
 * @route POST /api/getAllMedicines
 */
app.post('/api/getAllMedicines', async (req, res) => {
    try {
        // Sử dụng helper function để lấy và parse tất cả dữ liệu, dùng cổng fablo cho admin
        const allMedicines = await _fetchAndParseAllMedicinesFromLedger(AUTH_TOKEN, ip.fablo);
        res.json(allMedicines);
        console.log("Đã truy xuất tất cả bản ghi thuốc thành công.");
    } catch (error) {
        console.error("Lỗi khi lấy tất cả thuốc:", error.message);
        res.status(500).json({ 
            error: "Không thể truy xuất tất cả bản ghi thuốc.", 
            details: error.message 
        });
    }
});

/**
 * API truy xuất một bản ghi thuốc duy nhất bằng ID log của nó (bao gồm lịch sử).
 * Thường dùng cho chức năng truy xuất nguồn gốc.
 * @route POST /api/getMedicineByLogId
 * @body {string} logId - ID log duy nhất của bản ghi thuốc.
 * @body {string} token - Token xác thực của bất kỳ MSP nào có quyền đọc (ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP).
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi.
 */
app.post('/api/getMedicineByLogId', async (req, res) => {
    const { logId } = req.body;
    console.log("Đang nhận yêu cầu getMedicineByLogId cho logId:", logId);
    if (!logId) {
        return res.status(400).json({ error: "Thiếu logId để truy vấn." });
    }

    try {
        const response = await axios.post(`${FABLO_REST_URL}${ip.fablo}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getMedicineBylogId",
            args: [logId]
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, 
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("Đã truy xuất thuốc theo LogId thành công.");
    } catch (error) {
        console.error("Lỗi khi lấy thuốc theo LogId:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể truy xuất thuốc theo LogId.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});


// --- API cho Nhà Sản Xuất (Manufacturer) ---

/**
 * API tạo một lô thuốc mới trên sổ cái.
 * @route POST /api/createMedicine
 * @body {string} medicineId - ID của thuốc.
 * @body {string} batchId - ID lô của thuốc.
 * @body {string} manufacturerId - ID của nhà sản xuất.
 * @body {string} productionDate - Ngày sản xuất (YYYY-MM-DD).
 * @body {string} expiryDate - Ngày hết hạn (YYYY-MM-DD).
 * @body {number} quantity - Tổng số lượng được sản xuất trong lô này.
 * @body {string} token - Token xác thực của ManufacturerMSP.
 */
app.post('/api/createMedicine', async (req, res) => {
    const { medicineId, batchId, manufacturerId, productionDate, expiryDate, quantity, token } = req.body;
    if (!medicineId || !batchId || !manufacturerId || !quantity || !productionDate || !expiryDate) {
        return res.status(400).json({ error: "Thiếu các trường bắt buộc để tạo thuốc." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của ManufacturerMSP." });
    }

    console.log("Đang gửi yêu cầu createMedicine...");
    try {
        const response = await axios.post(
            `${FABLO_REST_URL}${ip.fablo}/invoke/channel/transfer`, // Cổng Fablo REST cho Manufacturer
            {
                method: "SupplyChainContract:createMedicine",
                args: [
                    medicineId,
                    batchId,
                    manufacturerId,
                    productionDate,
                    expiryDate,
                    quantity.toString() // Đảm bảo số lượng là chuỗi
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${token}`, // Sử dụng token từ request body
                    "Content-Type": "application/json"
                }
            }
        );
        res.json(response.data);
        console.log("Thuốc đã được tạo thành công:", response.data);
    } catch (error) {
        console.error("Lỗi khi tạo thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể tạo thuốc trên sổ cái.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API lấy các bản ghi thuốc (action: CREATE) được tạo bởi một nhà sản xuất cụ thể từ sổ cái.
 * @route POST /api/getMedicinesByManufacturer
 * @body {string} manufacturerId - ID của nhà sản xuất.
 * @body {string} token - Token xác thực để gọi smart contract (ví dụ: token admin hoặc Manufacturer MSP).
 */
app.post('/api/getMedicinesByManufacturer', async (req, res) => {
    const { manufacturerId, token, port } = req.body;
    console.log("Đang nhận yêu cầu lấy thuốc theo nhà sản xuất:", manufacturerId);

    if (!manufacturerId) {
        return res.status(400).json({ error: "Thiếu manufacturerId để truy vấn." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực." });
    }

    try {
        // Sử dụng cổng fablo cho nhà sản xuất khi truy vấn getAllMedicines
        const allMedicines = await _fetchAndParseAllMedicinesFromLedger(token, port);

        const filteredMedicines = allMedicines.filter(med => {
            return med.action === "CREATE" && med.manufacturerId === manufacturerId;
        });

        console.log(`Tìm thấy ${filteredMedicines.length} thuốc được tạo bởi NSX ${manufacturerId}.`);
        res.json(filteredMedicines);

    } catch (error) {
        console.error("Lỗi khi lấy thuốc theo nhà sản xuất:", error.message);
        res.status(500).json({ 
            error: "Không thể truy xuất thuốc theo nhà sản xuất.", 
            details: error.message 
        });
    }
});


// --- API cho Nhà Phân Phối / Kho (Distributor / Warehouse) ---

/**
 * API chuyển số lượng thuốc giữa các thực thể (Manufacturer, StorageA, StorageB, Pharmacy).
 * @route POST /api/transferMedicine
 * @body {string} parentLogId - ID log của bản ghi thuốc cha.
 * @body {string} fromId - ID của thực thể chuyển thuốc.
 * @body {string} toId - ID của thực thể nhận thuốc.
 * @body {string} transferCompanyId - ID của công ty vận chuyển.
 * @body {number} quantity - Số lượng thuốc cần chuyển.
 * @body {string} token - Token xác thực của ManufacturerMSP, StorageAMSP hoặc StorageBMSP.
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi (StorageA hoặc StorageB).
 */
app.post('/api/transferMedicine', async (req, res) => {
    const { parentLogId, fromId, toId, transferCompanyId, quantity, token, port } = req.body;
    if (!parentLogId || !fromId || !toId || !transferCompanyId || !quantity) {
        return res.status(400).json({ error: "Thiếu các trường bắt buộc để chuyển thuốc." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của ManufacturerMSP, StorageAMSP hoặc StorageBMSP." });
    }
    if (!port) { // Yêu cầu cổng cụ thể để biết gọi Fablo REST instance nào
        return res.status(400).json({ error: "Thiếu thông tin cổng Fablo REST API (port) của người gọi." });
    }

    console.log("Đang gửi yêu cầu transferMedicine...");
    try {
        const response = await axios.post(`${FABLO_REST_URL}${port}/invoke/channel/transfer`, {
            method: "SupplyChainContract:transferQuantity",
            args: [parentLogId, fromId, toId, transferCompanyId, quantity.toString()]
        }, {
            headers: {
                "Authorization": `Bearer ${token}`, 
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("Thuốc đã được chuyển thành công:", response.data);
    } catch (error) {
        console.error("Lỗi khi chuyển thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể chuyển thuốc trên sổ cái.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API phê duyệt và xử lý yêu cầu từ nhà thuốc.
 * @route POST /api/approvePharmacyRequest
 * @body {string} requestId - ID của yêu cầu nhà thuốc cần phê duyệt.
 * @body {Array<number>} approvedItemIndices - Mảng các chỉ số của các mục cần được phê duyệt.
 * @body {string} token - Token xác thực của ManufacturerMSP, StorageAMSP hoặc StorageBMSP.
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi (Distributor).
 */
app.post('/api/approvePharmacyRequest', async (req, res) => {
    const { requestId, approvedItemIndices, token, port } = req.body;
    console.log("Dữ liệu nhận được từ frontend cho approvePharmacyRequest:", req.body);

    if (!requestId || !Array.isArray(approvedItemIndices)) {
        return res.status(400).json({ error: "Thiếu Request ID hoặc 'approvedItemIndices' không hợp lệ." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của Distributor." });
    }
    if (!port) { // Yêu cầu cổng cụ thể để biết gọi Fablo REST instance nào
        return res.status(400).json({ error: "Thiếu thông tin cổng Fablo REST API (port) của người gọi." });
    }

    try {
        const comfingRequestJsonString = JSON.stringify(approvedItemIndices);
        console.log("approvedItemIndices đã được stringify:", comfingRequestJsonString);

        const response = await axios.post(`${FABLO_REST_URL}${port}/invoke/channel/transfer`, {
            method: "SupplyChainContract:approvePharmacyRequest",
            args: [requestId, comfingRequestJsonString]
        }, {
            headers: {
                "Authorization": `Bearer ${token}`, 
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("Yêu cầu nhà thuốc đã được phê duyệt thành công:", response.data);
    } catch(error) {
        console.error("Lỗi khi phê duyệt yêu cầu nhà thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể phê duyệt yêu cầu nhà thuốc.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API truy xuất tất cả các yêu cầu từ nhà thuốc (PharmacyRequest).
 * Sử dụng AUTH_TOKEN (admin token) để có quyền truy cập toàn bộ ledger.
 * @route POST /api/getPharmacyRequests
 * @body {string} [token] - Token có thể được cung cấp bởi frontend nếu muốn giới hạn quyền truy cập
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi.
 */
app.post('/api/getPharmacyRequests', async (req, res) => {
    const { token, port } = req.body; 
    if (!port) { // Yêu cầu cổng cụ thể để biết gọi Fablo REST instance nào
        return res.status(400).json({ error: "Thiếu thông tin cổng Fablo REST API (port) của người gọi." });
    }
    try {
        const response = await axios.post(`${FABLO_REST_URL}${port}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getPharmacyRequests",
            args: []
        }, {
            headers: {
                "Authorization": `Bearer ${token || AUTH_TOKEN}`, // Sử dụng token được cung cấp hoặc token admin
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("Đã truy xuất tất cả yêu cầu nhà thuốc thành công.");
    } catch (error) {
        console.error("Lỗi khi lấy yêu cầu nhà thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể truy xuất yêu cầu nhà thuốc.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API lấy tồn kho hiện tại của một kho cụ thể từ sổ cái.
 * Tồn kho được tính dựa trên các bản ghi INBOUND còn lại trong kho đó.
 * @route POST /api/getMedicinesByStorage
 * @body {string} storageId - ID của kho (ví dụ: "K001", "K002").
 * @body {string} token - Token xác thực để gọi smart contract (ví dụ: token admin hoặc Storage MSP).
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi (StorageA hoặc StorageB).
 */
app.post('/api/getMedicinesByStorage', async (req, res) => {
    const { distributorId, token, port } = req.body;
    console.log("Đang nhận yêu cầu lấy tồn kho theo nhà phân phối:", distributorId);

    if (!distributorId) {
        return res.status(400).json({ error: "Thiếu distributorId để truy vấn." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực." });
    }
    if (!port) { // Yêu cầu cổng cụ thể để biết gọi Fablo REST instance nào
        return res.status(400).json({ error: "Thiếu thông tin cổng Fablo REST API (port) của người gọi." });
    }

    try {
        const allMedicines = await _fetchAndParseAllMedicinesFromLedger(token, port);

        // Lọc ra những bản ghi INBOUND có distributedQuantities > 0 và toId là storageId.
        // distributedQuantities của bản ghi INBOUND thể hiện số lượng thuốc còn lại tại địa điểm 'toId' sau hành động INBOUND.
        const currentInventoryRecords = allMedicines.filter(record => {
            return record.action === 'INBOUND' && record.transferCompanyId == distributorId;
        });

        console.log(`Tìm thấy ${currentInventoryRecords.length} loại thuốc trong nhà phân phối ${distributorId}.`);
        res.json(currentInventoryRecords);

    } catch (error) {
        console.error("Lỗi khi lấy tồn kho theo kho:", error.message);
        res.status(500).json({ 
            error: "Không thể truy xuất tồn kho theo kho.", 
            details: error.message 
        });
    }
});


/**
 * API lấy tồn kho hiện tại của một nhà phân phối (tức là tổng tồn kho trong tất cả các kho của nhà phân phối đó).
 * @route POST /api/getMedicinesByDistributor
 * @body {string} distributorId - ID của nhà phân phối (ví dụ: "NPP0001").
 * @body {string} token - Token xác thực để gọi smart contract (ví dụ: token admin hoặc Distributor MSP).
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi (Distributor).
 */
app.post('/api/getMedicinesByDistributor', async (req, res) => {
    const { distributorId, token, port } = req.body;
    console.log("Đang nhận yêu cầu lấy tồn kho theo nhà phân phối:", distributorId);

    if (!distributorId) {
        return res.status(400).json({ error: "Thiếu distributorId để truy vấn." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực." });
    }
    if (!port) { // Yêu cầu cổng cụ thể để biết gọi Fablo REST instance nào
        return res.status(400).json({ error: "Thiếu thông tin cổng Fablo REST API (port) của người gọi." });
    }

    try {
        const pool = await conn;
        // 1. Lấy tất cả các MA_KHO thuộc về nhà phân phối này từ SQL Server
        const khoResult = await pool.request()
            .input('distributorId', sql.Char(7), distributorId)
            .query('SELECT MA_KHO FROM KHO WHERE MA_NHAPP = @distributorId');
        
        const khoIds = khoResult.recordset.map(row => row.MA_KHO);

        if (khoIds.length === 0) {
            console.log(`Không tìm thấy kho nào cho nhà phân phối ${distributorId}.`);
            return res.json([]); // Trả về mảng rỗng nếu không có kho nào
        }

        const allMedicines = await _fetchAndParseAllMedicinesFromLedger(token, port);

        const distributorInventoryRecords = allMedicines.filter(record => {
            // Lọc các bản ghi INBOUND mà thuốc được nhập vào một trong các kho của nhà phân phối
            return record.action === 'INBOUND' && khoIds.includes(record.toId) && record.distributedQuantities > 0;
        });

        // Tổng hợp tồn kho trên tất cả các kho của nhà phân phối
        const aggregatedInventory = {};
        distributorInventoryRecords.forEach(item => {
            const key = `${item.medicineId}_${item.batchId}`;
            if (!aggregatedInventory[key]) {
                aggregatedInventory[key] = {
                    medicineId: item.medicineId,
                    batchId: item.batchId,
                    quantity: 0,
                    locatedInWarehouses: new Set() // Để theo dõi thuốc này nằm ở những kho nào
                };
            }
            aggregatedInventory[key].quantity += item.distributedQuantities;
            aggregatedInventory[key].locatedInWarehouses.add(item.toId);
        });

        // Chuyển Set các kho thành mảng để trả về
        const finalInventory = Object.values(aggregatedInventory).map(item => ({
            ...item,
            locatedInWarehouses: Array.from(item.locatedInWarehouses)
        }));

        console.log(`Tìm thấy ${finalInventory.length} loại thuốc trong các kho của NPP ${distributorId}.`);
        res.json(finalInventory);

    } catch (error) {
        console.error("Lỗi khi lấy tồn kho theo nhà phân phối:", error.message);
        res.status(500).json({ 
            error: "Không thể truy xuất tồn kho theo nhà phân phối.", 
            details: error.message 
        });
    }
});


// --- API cho Nhà Thuốc (Pharmacy) ---

/**
 * API tạo một yêu cầu thuốc mới từ nhà thuốc.
 * @route POST /api/createPharmacyRequest
 * @body {string} pharmacyId - ID của nhà thuốc gửi yêu cầu.
 * @body {string} distributorId - ID của nhà phân phối mà yêu cầu được gửi đến.
 * @body {Array<Object>} items - Mảng các đối tượng chứa chi tiết thuốc (medicineId, quantity, OPTIONAL batchId).
 * @body {string} token - Token xác thực của PharmacyMSP.
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi (Pharmacy).
 */
app.post('/api/createPharmacyRequest', async (req, res) => {
    const { pharmacyId, distributorId, items, token, port } = req.body;
    console.log("Dữ liệu nhận được từ frontend cho createPharmacyRequest:", req.body); 

    if (!pharmacyId || !distributorId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Thiếu các trường bắt buộc hoặc 'items' không hợp lệ." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của PharmacyMSP." });
    }
    if (!port) { // Yêu cầu cổng cụ thể để biết gọi Fablo REST instance nào
        return res.status(400).json({ error: "Thiếu thông tin cổng Fablo REST API (port) của người gọi." });
    }

    try {
        const itemsJsonString = JSON.stringify(items);
        console.log("items đã được stringify:", itemsJsonString);

        const response = await axios.post(`${FABLO_REST_URL}${port}/invoke/channel/transfer`, {
            method: "SupplyChainContract:createPharmacyRequest",
            args: [pharmacyId, distributorId, itemsJsonString] 
        }, {
            headers: {
                "Authorization": `Bearer ${token}`, 
                "Content-Type": "application/json"
            }
        });
        console.log("Yêu cầu nhà thuốc đã được tạo thành công:", response.data);
        res.json(response.data);
    } catch (error) {
        console.error("Lỗi khi tạo yêu cầu nhà thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Yêu cầu không hợp lệ hoặc lỗi server khi tạo yêu cầu nhà thuốc.",
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API ghi lại việc tiêu thụ (bán ra) thuốc tại một địa điểm.
 * @route POST /api/consumeQuantity
 * @body {string} logId - ID log của bản ghi thuốc đang được tiêu thụ. (Nếu muốn consume theo medicineId, cần logic phức tạp hơn để tìm logId)
 * @body {string} locationId - ID của thực thể tiêu thụ/bán thuốc (ví dụ: ID nhà thuốc).
 * @body {string} consumerId - ID của người tiêu dùng (ví dụ: ID bệnh nhân).
 * @body {number} quantity - Số lượng thuốc đã tiêu thụ.
 * @body {number} price - Giá mà thuốc đã được tiêu thụ/bán.
 * @body {string} token - Token xác thực của PharmacyMSP, StorageAMSP hoặc StorageBMSP.
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi (Pharmacy).
 */
app.post('/api/consumeQuantity', async (req, res) => {
    const { medicineId, locationId, consumerId, quantity, price, token, port } = req.body;
    // Lưu ý: Smart contract hiện tại yêu cầu logId để consume. Nếu muốn consume chỉ bằng medicineId,
    // frontend cần gửi logId của một lô thuốc cụ thể từ tồn kho, HOẶC smart contract cần được điều chỉnh.
    console.log("Dữ liệu nhận được từ frontend cho consumeQuantity:", req.body);
    if (!medicineId || !locationId || !consumerId || !quantity || !price) {
        return res.status(400).json({ error: "Thiếu các trường bắt buộc để tiêu thụ thuốc." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của PharmacyMSP, StorageAMSP hoặc StorageBMSP." });
    }
    if (!port) { // Yêu cầu cổng cụ thể để biết gọi Fablo REST instance nào
        return res.status(400).json({ error: "Thiếu thông tin cổng Fablo REST API (port) của người gọi." });
    }

    console.log("Đang gửi yêu cầu consumeQuantity...");
    try {
        const response = await axios.post(`${FABLO_REST_URL}${port}/invoke/channel/transfer`, {
            method: "SupplyChainContract:consumeQuantity",
            args: [medicineId, locationId, consumerId, quantity.toString(), price.toString()]
        }, {
            headers: {
                "Authorization": `Bearer ${token}`, 
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("Thuốc đã được tiêu thụ thành công:", response.data);
    } catch (error) {
        console.error("Lỗi khi tiêu thụ thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể tiêu thụ thuốc trên sổ cái.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API truy xuất tồn kho của một nhà thuốc cụ thể.
 * Nó sẽ gọi getAllMedicines từ smart contract, sau đó lọc ra các giao dịch PharmacyDelivery
 * mà toId của chúng khớp với pharmacyId được cung cấp.
 * @route POST /api/getPharmacyInventory
 * @body {string} pharmacyId - ID của nhà thuốc cần lấy tồn kho (ví dụ: "NT0001").
 * @body {string} token - Token xác thực của PharmacyMSP hoặc một MSP có quyền đọc.
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi (Pharmacy).
 */
app.post('/api/getPharmacyInventory', async (req, res) => {
    const { pharmacyId, token, port } = req.body;
    console.log("Đang nhận yêu cầu getPharmacyInventory cho pharmacyId:", pharmacyId);

    if (!pharmacyId) {
        return res.status(400).json({ error: "Thiếu pharmacyId để truy vấn tồn kho." });
    }
    if (!token) { // Yêu cầu token từ frontend để kiểm soát quyền truy cập
        return res.status(401).json({ error: "Missing authentication token for pharmacy inventory." });
    }
    if (!port) { // Yêu cầu cổng cụ thể để biết gọi Fablo REST instance nào
        return res.status(400).json({ error: "Thiếu thông tin cổng Fablo REST API (port) của người gọi." });
    }

    try {
        const allMedicines = await _fetchAndParseAllMedicinesFromLedger(token, port);

        // Lọc ra các bản ghi là PharmacyDelivery và có toId khớp với pharmacyId được yêu cầu
        const pharmacyInventory = allMedicines.filter(record => {
            return record.action === 'PharmacyDelivery' && record.toId === pharmacyId && record.distributedQuantities > 0;
        });

        // Tổng hợp số lượng nếu có nhiều bản ghi delivery cho cùng một thuốc/batch
        const aggregatedInventory = {};
        pharmacyInventory.forEach(item => {
            const key = item.medicineId; 
            
            if (!aggregatedInventory[key]) {
                aggregatedInventory[key] = {
                    medicineId: item.medicineId,
                    quantity: 0,
                    deliveryLogIds: [] 
                };
            }
            aggregatedInventory[key].quantity += item.distributedQuantities;
            aggregatedInventory[key].deliveryLogIds.push(item.txId);
        });

        const finalInventory = Object.values(aggregatedInventory);
        res.json(finalInventory);
        console.log(`Đã truy xuất và lọc tồn kho cho nhà thuốc ${pharmacyId} thành công.`);
    } catch (error) {
        console.error("Lỗi khi lấy tồn kho nhà thuốc:", error.message);
        res.status(500).json({ 
            error: "Không thể truy xuất tồn kho nhà thuốc.", 
            details: error.message 
        });
    }
});


// --- API cho Bệnh Nhân (Patient) ---

/**
 * API lấy lịch sử mua hàng của một bệnh nhân tại một hoặc tất cả các nhà thuốc.
 * @route POST /api/getPatientPurchaseHistory
 * @body {string} patientId - ID của bệnh nhân (consumerId - số điện thoại).
 * @body {string} [pharmacyId] - ID của nhà thuốc để lọc giao dịch (tùy chọn).
 * @body {string} token - Token xác thực để gọi smart contract (ví dụ: token admin).
 * @body {string} port - Cổng Fablo REST API cụ thể của người gọi (Pharmacy hoặc Fablo/Admin).
 */
app.post('/api/getPatientPurchaseHistory', async (req, res) => {
    const { patientId, pharmacyId } = req.body;
    console.log(req.body);
    console.log(`Đang nhận yêu cầu lấy lịch sử mua hàng cho bệnh nhân: ${patientId}${pharmacyId ? ` tại nhà thuốc: ${pharmacyId}` : ''}`);

    if (!patientId) {
        return res.status(400).json({ error: "Thiếu patientId để truy vấn." });
    }

    try {
        // Lấy thông tin nhà thuốc từ SQL nếu pharmacyId được cung cấp
        let pharmacyInfo = null;
        if (pharmacyId) {
            // Lưu ý: API getPharmacy đang sử dụng ip.backend, không cần thay đổi port ở đây.
            const pharmacyRes = await axios.post(`http://${ip.host}:${ip.backend}/api/getPharmacy`, { pharmacyId });
            pharmacyInfo = pharmacyRes.data[0]; // Lấy bản ghi đầu tiên nếu có
            if (!pharmacyInfo) {
                console.warn(`Không tìm thấy thông tin nhà thuốc với ID: ${pharmacyId}`);
            }
        }

        const allMedicines = await _fetchAndParseAllMedicinesFromLedger(AUTH_TOKEN, ip.fablo);
        // Lọc các bản ghi PharmacyDelivery
        const pharmacyDeliveries = allMedicines.filter(record => {
            const isDelivery = record.action == 'PharmacyDelivery';
            const isToTargetPharmacy = pharmacyId ? (record.toId === pharmacyId) : true; // Lọc theo pharmacyId nếu được cung cấp
            return isDelivery && isToTargetPharmacy;
        });
        let purchaseHistory = [];
        // Duyệt qua các bản ghi PharmacyDelivery và trích xuất các sự kiện CONSUME của bệnh nhân
        for (const delivery of pharmacyDeliveries) {
            if (Array.isArray(delivery.consumptionDetails)) {
                for (const detail of delivery.consumptionDetails) {
                    if (detail.type == 'CONSUME' && detail.consumerId == patientId) {
                        purchaseHistory.push({
                            medicineId: delivery.medicineId,
                            batchId: delivery.batchId,
                            quantity: detail.quantity,
                            price: detail.price,
                            timestamp: detail.timestamp,
                            locationId: detail.locationId, // Nhà thuốc nơi mua hàng
                            txId: delivery.txId // ID giao dịch PharmacyDelivery gốc
                        });
                    }
                }
            }
        }
        console.log(purchaseHistory);
        console.log(`Tìm thấy ${purchaseHistory.length} giao dịch mua hàng cho bệnh nhân ${patientId}${pharmacyId ? ` tại nhà thuốc ${pharmacyId}` : ''}.`);
        res.json(purchaseHistory);

    } catch (error) {
        console.error("Lỗi khi lấy lịch sử mua hàng của bệnh nhân:", error.message);
        res.status(500).json({ 
            error: "Không thể truy xuất lịch sử mua hàng của bệnh nhân.", 
            details: error.message 
        });
    }
});


// --- API Truy xuất Master Data từ SQL Server (Dữ liệu tĩnh) ---

/**
 * API lấy thông tin thuốc từ SQL Server.
 * @route GET /api/getThuoc/:maThuoc
 * @param {string} maThuoc - Mã thuốc cần tìm.
 */
app.get('/api/getThuoc/:maThuoc', async (req, res) => {
    try {
        const maThuoc = req.params.maThuoc;
        const pool = await conn;
        const result = await pool
            .request()
            .input('maThuoc', sql.VarChar, maThuoc)
            .query('SELECT T.*, B.TEN_BQ, B.MO_TA, B.NHIET_DO_MIN_C, B.NHIET_DO_MAX_C, B.DO_AM_MIN_PERCENT, B.DO_AM_MAX_PERCENT, B.ANH_SANG_INFO FROM THUOC T JOIN BQ B ON T.MA_BQ = B.MA_BQ WHERE T.MaThuoc = @maThuoc');
        res.json(result.recordset);
    } catch (err) {
        console.error('SQL error (getThuoc):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho thuốc.' });
    }
});

/**
 * API lấy tất cả thông tin thuốc từ SQL Server.
 * Bao gồm thông tin từ bảng THUOC và BQ (bảo quản).
 * @route POST /api/getThuoc
 */
app.post('/api/getThuoc', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool
            .request()
            .query(`
                SELECT 
                    T.*, 
                    B.TEN_BQ, 
                    B.MO_TA, 
                    B.NHIET_DO_MIN_C, 
                    B.NHIET_DO_MAX_C, 
                    B.DO_AM_MIN_PERCENT, 
                    B.DO_AM_MAX_PERCENT, 
                    B.ANH_SANG_INFO 
                FROM THUOC T
                JOIN BQ B ON T.MA_BQ = B.MA_BQ
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('SQL error (getAllThuoc):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho tất cả thuốc.' });
    }
});

/**
 * API lấy tất cả thông tin Nhà Sản Xuất từ SQL Server.
 * @route GET /api/getNhaSanXuat
 */
app.get('/api/getNhaSanXuat', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.request().query('SELECT * FROM NHA_SX');
        res.json(result.recordset);
    } catch (err) {
        console.error('SQL error (getNhaSanXuat):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho nhà sản xuất.' });
    }
});

/**
 * API lấy tất cả thông tin Nhà Phân Phối từ SQL Server.
 * @route GET /api/getNhaPhanPhoi
 */
app.get('/api/getNhaPhanPhoi', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.request().query('SELECT * FROM PP');
        res.json(result.recordset);
    } catch (err) {
        console.error('SQL error (getNhaPhanPhoi):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho nhà phân phối.' });
    }
});

/**
 * API lấy tất cả thông tin Nhà Thuốc từ SQL Server.
 * @route GET /api/getNhaThuoc
 */
app.get('/api/getNhaThuoc', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.request().query('SELECT * FROM NHA_THUOC');
        res.json(result.recordset);
    } catch (err) {
        console.error('SQL error (getNhaThuoc):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho nhà thuốc.' });
    }
});

/**
 * API lấy tất cả thông tin Kho từ SQL Server.
 * @route POST /api/getInventory
 */
app.post('/api/getInventory', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.query(`SELECT * FROM KHO`);
        res.json(result.recordset); 
    } catch (err) {
        console.error('SQL error (getInventory):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho kho.' });
    }
});

/**
 * API lấy tất cả thông tin Nhà Thuốc từ SQL Server, hoặc một nhà thuốc cụ thể nếu pharmacyId được cung cấp.
 * @route POST /api/getPharmacy
 * @body {string} [pharmacyId] - ID của nhà thuốc cần lấy thông tin. Nếu không có, trả về tất cả.
 */
app.post('/api/getPharmacy', async (req, res) => {
    const { pharmacyId } = req.body;
    try {
        const pool = await conn;
        let query = `SELECT * FROM NHA_THUOC`;
        let request = pool.request();
        if (pharmacyId) {
            query += ` WHERE MA_NHA_THUOC = @pharmacyId`;
            request.input('pharmacyId', sql.Char(6), pharmacyId);
        }
        const result = await request.query(query);
        res.json(result.recordset); 
    } catch (err) {
        console.error('SQL error (getPharmacy):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho nhà thuốc.' });
    }
});

/**
 * API lấy thông tin bệnh nhân từ SQL Server.
 * @route GET /api/getBenhNhan
 */
app.get('/api/getBenhNhan', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.query(`select * from BENHNHAN`)
        res.json(result.recordset); 
    } catch (err) {
        console.error('SQL error (getBenhNhan):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho bệnh nhân.' });
    }
});


// Lắng nghe cổng
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
