'use strict';

const express = require('express');
const axios = require('axios');
const app = express();
const sql = require('mssql');
const path = require('path');
const cors = require('cors');

// Import cấu hình IP từ file config-network.json
const ip = require('../config-network.json'); // Đảm bảo đường dẫn chính xác

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
    console.log('✅ Connected to SQL Server');
    return pool;
}).catch(err => {
    console.error('❌ Failed to connect to SQL Server:', err);
    process.exit(1); // Thoát ứng dụng nếu không thể kết nối DB
});

const PORT = 3001; // Cổng cho backend server
app.use(cors({ origin: `http://${ip.host}:${ip.frontend}` })); // Cho phép CORS từ frontend

// Cấu hình Fablo REST API URL
const FABLO_REST_URL = `http://${ip.host}:${ip.fablo}`;
let AUTH_TOKEN = ""; // Biến toàn cục để lưu token admin

app.use(express.json()); // Middleware để phân tích cú pháp JSON trong request body

console.log(`
    ✅ Frontend running at http://${ip.host}:${ip.frontend}
    ✅ Backend running at http://${ip.host}:${ip.backend} (Port: ${PORT})
    ✅ Fablo REST API at http://${ip.host}:${ip.fablo}
`);

// --- Các hàm hỗ trợ ---
/**
 * Cập nhật AUTH_TOKEN bằng cách gọi Fablo REST /user/enroll.
 * Token này thường là token của admin để thực hiện các truy vấn chung.
 */
async function updateAuthToken() {
    try {
        const result = await axios.post(`${FABLO_REST_URL}/user/enroll`, {
            id: "admin",
            secret: "adminpw"
        }, {
            headers: { "Content-Type": "application/json" }
        });
        AUTH_TOKEN = result.data.token;
        console.log("🔑 Token admin đã được cập nhật.");
    } catch (error) {
        console.error("❌ Lỗi khi lấy token admin:", error.message);
    }
}

// Gọi ngay khi server khởi động để có token ban đầu
updateAuthToken();
// Lặp lại mỗi 10 phút để đảm bảo token luôn hợp lệ
setInterval(updateAuthToken, 10 * 60 * 1000);

// --- Các API Fablo REST (Tương tác với Smart Contract) ---

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
        const result = await axios.post(`${FABLO_REST_URL}/user/enroll`, {
            id: id,
            secret: secret
        }, {
            headers: { "Content-Type": "application/json" }
        });
        console.log(`🔑 Đã lấy token cho người dùng: ${id}`);
        res.json({ token: result.data.token });
    } catch (err) {
        console.error("❌ Lỗi khi lấy token cho người dùng:", err.response ? err.response.data : err.message);
        res.status(err.response ? err.response.status : 500).json({ 
            error: "Failed to get user token", 
            details: err.response ? err.response.data : err.message 
        });
    }
});

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
            `${FABLO_REST_URL}/invoke/channel/transfer`, // Sử dụng cổng của Manufacturer MSP (8801) cho Fablo REST
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
        console.log("✅ Thuốc đã được tạo thành công:", response.data);
    } catch (error) {
        console.error("❌ Lỗi khi tạo thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể tạo thuốc trên sổ cái.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API chuyển số lượng thuốc giữa các thực thể (Manufacturer, StorageA, StorageB).
 * @route POST /api/transferMedicine
 * @body {string} parentLogId - ID log của bản ghi thuốc cha.
 * @body {string} fromId - ID của thực thể chuyển thuốc.
 * @body {string} toId - ID của thực thể nhận thuốc.
 * @body {string} transferCompanyId - ID của công ty vận chuyển.
 * @body {number} quantity - Số lượng thuốc cần chuyển.
 * @body {string} token - Token xác thực của ManufacturerMSP, StorageAMSP hoặc StorageBMSP.
 */
app.post('/api/transferMedicine', async (req, res) => {
    const { parentLogId, fromId, toId, transferCompanyId, quantity, token } = req.body;
    if (!parentLogId || !fromId || !toId || !transferCompanyId || !quantity) {
        return res.status(400).json({ error: "Thiếu các trường bắt buộc để chuyển thuốc." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của ManufacturerMSP, StorageAMSP hoặc StorageBMSP." });
    }

    console.log("Đang gửi yêu cầu transferMedicine...");
    try {
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:transferQuantity",
            args: [parentLogId, fromId, toId, transferCompanyId, quantity.toString()]
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, // Sử dụng token từ request body
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("✅ Thuốc đã được chuyển thành công:", response.data);
    } catch (error) {
        console.error("❌ Lỗi khi chuyển thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể chuyển thuốc trên sổ cái.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API tạo một yêu cầu thuốc mới từ nhà thuốc.
 * @route POST /api/createPharmacyRequest
 * @body {string} pharmacyId - ID của nhà thuốc gửi yêu cầu.
 * @body {string} distributorId - ID của nhà phân phối mà yêu cầu được gửi đến.
 * @body {Array<Object>} items - Mảng các đối tượng chứa chi tiết thuốc (medicineId, quantity, OPTIONAL batchId).
 * @body {string} token - Token xác thực của PharmacyMSP.
 */
app.post('/api/createPharmacyRequest', async (req, res) => {
    const { pharmacyId, distributorId, items, token } = req.body;
    console.log("Dữ liệu nhận được từ frontend cho createPharmacyRequest:", req.body); 

    if (!pharmacyId || !distributorId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Thiếu các trường bắt buộc hoặc 'items' không hợp lệ." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của PharmacyMSP." });
    }

    try {
        const itemsJsonString = JSON.stringify(items);
        console.log("items đã được stringify:", itemsJsonString);

        // Giả sử Fablo REST API cho Pharmacy cũng chạy trên cùng một Fablo REST URL
        // Nếu Pharmacy có cổng REST riêng, cần cấu hình thêm trong config-network.json
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:createPharmacyRequest",
            args: [pharmacyId, distributorId, itemsJsonString] 
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, 
                "Content-Type": "application/json"
            }
        });
        console.log("✅ Yêu cầu nhà thuốc đã được tạo thành công:", response.data);
        res.json(response.data);
    } catch (error) {
        console.error("❌ Lỗi khi tạo yêu cầu nhà thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Yêu cầu không hợp lệ hoặc lỗi server khi tạo yêu cầu nhà thuốc.",
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
 */
app.post('/api/approvePharmacyRequest', async (req, res) => {
    const { requestId, approvedItemIndices, token } = req.body;
    console.log("Dữ liệu nhận được từ frontend cho approvePharmacyRequest:", req.body);

    if (!requestId || !Array.isArray(approvedItemIndices)) {
        return res.status(400).json({ error: "Thiếu Request ID hoặc 'approvedItemIndices' không hợp lệ." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của Distributor." });
    }

    try {
        const comfingRequestJsonString = JSON.stringify(approvedItemIndices);
        console.log("approvedItemIndices đã được stringify:", comfingRequestJsonString);

        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:approvePharmacyRequest",
            args: [requestId, comfingRequestJsonString]
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, 
                "Content-Type": "application/json"
            }
        });
        console.log("✅ Yêu cầu nhà thuốc đã được phê duyệt thành công:", response.data);
        res.json(response.data);
    } catch(error) {
        console.error("❌ Lỗi khi phê duyệt yêu cầu nhà thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể phê duyệt yêu cầu nhà thuốc.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API ghi lại việc tiêu thụ (bán ra) thuốc tại một địa điểm.
 * @route POST /api/consumeQuantity
 * @body {string} logId - ID log của bản ghi thuốc đang được tiêu thụ.
 * @body {string} locationId - ID của thực thể tiêu thụ/bán thuốc (ví dụ: ID nhà thuốc).
 * @body {string} consumerId - ID của người tiêu dùng (ví dụ: ID bệnh nhân).
 * @body {number} quantity - Số lượng thuốc đã tiêu thụ.
 * @body {number} price - Giá mà thuốc đã được tiêu thụ/bán.
 * @body {string} token - Token xác thực của PharmacyMSP, StorageAMSP hoặc StorageBMSP.
 */
app.post('/api/consumeQuantity', async (req, res) => {
    const { medicineId, locationId, consumerId, quantity, price, token } = req.body;
    if (!medicineId || !locationId || !consumerId || !quantity || !price) {
        return res.status(400).json({ error: "Thiếu các trường bắt buộc để tiêu thụ thuốc." });
    }
    if (!token) {
        return res.status(401).json({ error: "Thiếu token xác thực. Yêu cầu token của PharmacyMSP, StorageAMSP hoặc StorageBMSP." });
    }

    console.log("Đang gửi yêu cầu consumeQuantity...");
    try {
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:consumeQuantity",
            args: [medicineId, locationId, consumerId, quantity.toString(), price.toString()]
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, // Sử dụng token từ request body
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("✅ Thuốc đã được tiêu thụ thành công:", response.data);
    } catch (error) {
        console.error("❌ Lỗi khi tiêu thụ thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể tiêu thụ thuốc trên sổ cái.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API truy xuất một bản ghi thuốc duy nhất bằng ID log của nó (bao gồm lịch sử).
 * @route POST /api/getMedicineByLogId
 * @body {string} logId - ID log duy nhất của bản ghi thuốc.
 * @body {string} token - Token xác thực của bất kỳ MSP nào có quyền đọc (ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP).
 */
app.post('/api/getMedicineByLogId', async (req, res) => {
    const { logId } = req.body;
    console.log("Đang nhận yêu cầu getMedicineByLogId cho logId:", logId);
    if (!logId) {
        return res.status(400).json({ error: "Thiếu logId để truy vấn." });
    }
    try {
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getMedicineBylogId",
            args: [logId]
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, 
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("✅ Đã truy xuất thuốc theo LogId thành công.");
    } catch (error) {
        console.error("❌ Lỗi khi lấy thuốc theo LogId:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể truy xuất thuốc theo LogId.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API truy xuất tất cả các bản ghi thuốc và giao dịch từ sổ cái.
 * Sử dụng AUTH_TOKEN (admin token) để có quyền truy cập toàn bộ ledger.
 * @route POST /api/getAllMedicines
 */
app.post('/api/getAllMedicines', async (req, res) => {
    // Có thể thêm kiểm tra token nếu muốn giới hạn quyền truy cập vào API này
    // if (!req.body.token) { return res.status(401).json({ error: "Missing authentication token." }); }

    try {
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getAllMedicines",
            args: []
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, // Sử dụng token admin
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("✅ Đã truy xuất tất cả bản ghi thuốc thành công.");
    } catch (error) {
        console.error("❌ Lỗi khi lấy tất cả thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể truy xuất tất cả bản ghi thuốc.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});


/**
 * API truy xuất tất cả các yêu cầu từ nhà thuốc (PharmacyRequest).
 * Sử dụng AUTH_TOKEN (admin token) để có quyền truy cập toàn bộ ledger.
 * @route POST /api/getPharmacyRequests
 */
app.post('/api/getPharmacyRequests', async (req, res) => {
    // Có thể thêm kiểm tra token nếu muốn giới hạn quyền truy cập vào API này
    // if (!req.body.token) { return res.status(401).json({ error: "Missing authentication token." }); }
    
    try {
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getPharmacyRequests",
            args: []
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, // Sử dụng token admin
                "Content-Type": "application/json"
            }
        });
        res.json(response.data);
        console.log("✅ Đã truy xuất tất cả yêu cầu nhà thuốc thành công.");
    } catch (error) {
        console.error("❌ Lỗi khi lấy yêu cầu nhà thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể truy xuất yêu cầu nhà thuốc.", 
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
 */
app.post('/api/getPharmacyInventory', async (req, res) => {
    const { pharmacyId, token } = req.body;
    console.log("Đang nhận yêu cầu getPharmacyInventory cho pharmacyId:", pharmacyId);

    if (!pharmacyId) {
        return res.status(400).json({ error: "Thiếu pharmacyId để truy vấn tồn kho." });
    }
    if (!token) { // Yêu cầu token từ frontend để kiểm soát quyền truy cập
        return res.status(401).json({ error: "Missing authentication token for pharmacy inventory." });
    }

    try {
        // Lấy tất cả các bản ghi từ smart contract (sử dụng token được cung cấp)
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getAllMedicines",
            args: []
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`, // Sử dụng token từ request body
                "Content-Type": "application/json"
            }
        });

        // Khởi tạo biến để lưu payload dữ liệu từ smart contract
        let allMedicinesRaw;

        // Ưu tiên response.data.result.payload (cấu trúc phổ biến cho invoke/query)
        if (response.data && response.data.result && response.data.result.payload) {
            allMedicinesRaw = response.data.result.payload;
            console.log(`[DEBUG] Found payload in response.data.result.payload`);
        } 
        // Sau đó kiểm tra response.data.response (cấu trúc bạn vừa gặp)
        else if (response.data && response.data.response) {
            allMedicinesRaw = response.data.response;
            console.log(`[DEBUG] Found payload in response.data.response`);
        }
        // Tiếp theo, kiểm tra response.data.payload
        else if (response.data && response.data.payload) {
            allMedicinesRaw = response.data.payload;
            console.log(`[DEBUG] Found payload in response.data.payload`);
        }
        // Cuối cùng, thử response.data trực tiếp
        else if (response.data) {
            allMedicinesRaw = response.data;
            console.log(`[DEBUG] Found payload in response.data (direct)`);
        }

        console.log(`[DEBUG] Type of allMedicinesRaw after initial checks: ${typeof allMedicinesRaw}`);
        // Chuyển allMedicinesRaw thành chuỗi để log, tránh [object Object]
        console.log(`[DEBUG] Value of allMedicinesRaw (first 200 chars): ${String(allMedicinesRaw).substring(0, 200)}...`); 

        let allMedicines;
        if (typeof allMedicinesRaw === 'string') {
            try {
                allMedicines = JSON.parse(allMedicinesRaw);
                console.log(`[DEBUG] Type of allMedicines AFTER JSON.parse: ${typeof allMedicines}`);
                console.log(`[DEBUG] Is allMedicines an Array after parse? ${Array.isArray(allMedicines)}`);
            } catch (e) {
                console.error("❌ Lỗi phân tích JSON từ getAllMedicines (Payload):", e.message);
                return res.status(500).json({ error: "Dữ liệu payload từ smart contract không hợp lệ (không phải JSON hợp lệ)." });
            }
        } else if (Array.isArray(allMedicinesRaw)) { // Trường hợp axios đã tự động parse thành mảng
            allMedicines = allMedicinesRaw;
            console.log(`[DEBUG] allMedicinesRaw đã là mảng, không cần parse lại.`);
        } else {
            console.error(`[DEBUG] allMedicinesRaw không phải chuỗi cũng không phải mảng: ${typeof allMedicinesRaw}, value: ${JSON.stringify(allMedicinesRaw)}`);
            return res.status(500).json({ error: "Dữ liệu tồn kho không ở định dạng mong muốn (không phải chuỗi JSON hoặc mảng)." });
        }

        // Kiểm tra cuối cùng trước khi gọi filter
        if (!Array.isArray(allMedicines)) {
            console.error(`[DEBUG] Final check: allMedicines không phải là mảng trước khi gọi filter. Type: ${typeof allMedicines}`);
            return res.status(500).json({ error: "Dữ liệu tồn kho không phải là mảng, không thể lọc." });
        }

        // Lọc ra các bản ghi là PharmacyDelivery và có toId khớp với pharmacyId được yêu cầu
        const pharmacyInventory = allMedicines.filter(record => {
            return record.action == 'PharmacyDelivery' && record.toId == pharmacyId && record.distributedQuantities > 0;
        });

        // Bạn có thể muốn tổng hợp số lượng nếu có nhiều bản ghi delivery cho cùng một thuốc/batch
        const aggregatedInventory = {};
        console.log("Pharmacy Inventory after initial filter:", pharmacyInventory); // Log chi tiết hơn
        pharmacyInventory.forEach(item => {
            // Thay đổi key để chỉ nhóm theo medicineId
            const key = item.medicineId; 
            
            if (!aggregatedInventory[key]) {
                aggregatedInventory[key] = {
                    medicineId: item.medicineId,
                    // Bỏ batchId khỏi cấu trúc tổng hợp nếu bạn chỉ muốn nhóm theo medicineId
                    // batchId: item.batchId, // Bỏ dòng này hoặc giữ lại nếu muốn hiển thị batchId của một trong các lô
                    quantity: 0,
                    deliveryLogIds: [] 
                };
            }
            aggregatedInventory[key].quantity += item.distributedQuantities;
            aggregatedInventory[key].deliveryLogIds.push(item.txId);
        });

        // Chuyển đối tượng tổng hợp thành mảng
        const finalInventory = Object.values(aggregatedInventory);
        res.json(finalInventory);
        console.log(`✅ Đã truy xuất và lọc tồn kho cho nhà thuốc ${pharmacyId} thành công.`);
    } catch (error) {
        console.error("❌ Lỗi khi lấy tồn kho nhà thuốc:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể truy xuất tồn kho nhà thuốc.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});


app.post('/api/medicines/by-manufacturer/:manufacturerId', async (req, res) => {
    const { manufacturerId } = req.params;
    console.log("Đang nhận yêu cầu lấy thuốc theo nhà sản xuất:", manufacturerId);

    if (!manufacturerId) {
        return res.status(400).json({ error: "Thiếu manufacturerId để truy vấn." });
    }

    try {
        // Gọi smart contract để lấy tất cả thuốc
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getAllMedicines",
            args: []
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        // Dữ liệu trả về có thể nằm trong response.data.response
        const rawData = response.data.response || [];

        // Lọc các thuốc có action === "CREATE" và đúng manufacturerId
        const filteredMedicines = rawData.filter(med => {
            return med.action == "CREATE" && med.manufacturerId == manufacturerId;
        });

        console.log(`✅ Tìm thấy ${filteredMedicines.length} thuốc được tạo bởi NSX ${manufacturerId}.`);
        res.json(filteredMedicines);

    } catch (error) {
        console.error("❌ Lỗi khi lấy thuốc theo nhà sản xuất:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể truy xuất thuốc theo nhà sản xuất.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

/**
 * API lấy lịch sử mua hàng của một bệnh nhân tại một hoặc tất cả các nhà thuốc.
 * @route POST /api/getPatientPurchaseHistory
 * @body {string} patientId - ID của bệnh nhân (consumerId - số điện thoại).
 * @body {string} [pharmacyId] - ID của nhà thuốc để lọc giao dịch (tùy chọn).
 * @body {string} token - Token xác thực để gọi smart contract (ví dụ: token admin).
 */
app.post('/api/getPatientPurchaseHistory', async (req, res) => {
    const { patientId, pharmacyId } = req.body;
    console.log(`Đang nhận yêu cầu lấy lịch sử mua hàng cho bệnh nhân: ${patientId}${pharmacyId ? ` tại nhà thuốc: ${pharmacyId}` : ''}`);

    if (!patientId) {
        return res.status(400).json({ error: "Thiếu patientId để truy vấn." });
    }

    try {
        // Lấy thông tin nhà thuốc từ SQL nếu pharmacyId được cung cấp
        let pharmacyInfo = null;
        if (pharmacyId) {
            const pharmacyRes = await axios.post(`http://${ip.host}:${ip.backend}/api/getPharmacy`, { pharmacyId });
            pharmacyInfo = pharmacyRes.data[0]; // Lấy bản ghi đầu tiên nếu có
            if (!pharmacyInfo) {
                console.warn(`Không tìm thấy thông tin nhà thuốc với ID: ${pharmacyId}`);
            }
        }

        // Gọi smart contract để lấy tất cả các bản ghi thuốc và giao dịch
        const response = await axios.post(`${FABLO_REST_URL}/invoke/channel/transfer`, {
            method: "SupplyChainContract:getAllMedicines",
            args: []
        }, {
            headers: {
                "Authorization": `Bearer ${AUTH_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        let allMedicinesRaw;
        if (response.data && response.data.result && response.data.result.payload) {
            allMedicinesRaw = response.data.result.payload;
        } else if (response.data && response.data.response) {
            allMedicinesRaw = response.data.response;
        } else if (response.data && response.data.payload) {
            allMedicinesRaw = response.data.payload;
        } else if (response.data) {
            allMedicinesRaw = response.data;
        }

        let allMedicines;
        if (typeof allMedicinesRaw === 'string') {
            try {
                allMedicines = JSON.parse(allMedicinesRaw);
            } catch (e) {
                console.error("❌ Lỗi phân tích JSON từ getAllMedicines (Payload):", e.message);
                return res.status(500).json({ error: "Dữ liệu payload từ smart contract không hợp lệ (không phải JSON hợp lệ)." });
            }
        } else if (Array.isArray(allMedicinesRaw)) {
            allMedicines = allMedicinesRaw;
        } else {
            return res.status(500).json({ error: "Dữ liệu từ smart contract không ở định dạng mong muốn." });
        }

        const purchaseHistory = [];

        // Lọc các bản ghi PharmacyDelivery
        const pharmacyDeliveries = allMedicines.filter(record => {
            const isDelivery = record.action === 'PharmacyDelivery';
            const isToTargetPharmacy = pharmacyId ? (record.toId === pharmacyId) : true; // Lọc theo pharmacyId nếu được cung cấp
            return isDelivery && isToTargetPharmacy;
        });

        // Duyệt qua các bản ghi PharmacyDelivery và trích xuất các sự kiện CONSUME của bệnh nhân
        for (const delivery of pharmacyDeliveries) {
            if (Array.isArray(delivery.consumptionDetails)) {
                for (const detail of delivery.consumptionDetails) {
                    if (detail.type === 'CONSUME' && detail.consumerId === patientId) {
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

        console.log(`✅ Tìm thấy ${purchaseHistory.length} giao dịch mua hàng cho bệnh nhân ${patientId}${pharmacyId ? ` tại nhà thuốc ${pharmacyId}` : ''}.`);
        res.json(purchaseHistory);

    } catch (error) {
        console.error("❌ Lỗi khi lấy lịch sử mua hàng của bệnh nhân:", error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({ 
            error: "Không thể truy xuất lịch sử mua hàng của bệnh nhân.", 
            details: error.response ? error.response.data : error.message 
        });
    }
});

// --- Các API SQL Server (Tương tác với cơ sở dữ liệu truyền thống) ---

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
            .query('SELECT * FROM THUOC WHERE MaThuoc = @maThuoc');
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ SQL error (getThuoc):', err);
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
                SELECT *
                FROM THUOC T
                JOIN BQ B ON T.MA_BQ = B.MA_BQ
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ SQL error (getAllThuoc):', err);
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
        console.error('❌ SQL error (getNhaSanXuat):', err);
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
        console.error('❌ SQL error (getNhaPhanPhoi):', err);
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
        console.error('❌ SQL error (getNhaThuoc):', err);
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
        console.error('❌ SQL error (getInventory):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho kho.' });
    }
});

/**
 * API lấy tất cả thông tin Nhà Thuốc từ SQL Server.
 * @route POST /api/getPharmacy
 */
app.get('/api/getBenhNhan', async (req, res) => {
    try {
        const pool = await conn;
        const result = await pool.query(`select * from BENHNHAN`)
        res.json(result.recordset); 
    } catch (err) {
        console.error('❌ SQL error (getPharmacy):', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn SQL Server cho nhà thuốc.' });
    }
});


// Lắng nghe cổng
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
