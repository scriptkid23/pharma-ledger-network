'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

class SupplyChainContract extends Contract {
    /**
     * Hàm trợ giúp để thực thi kiểm soát truy cập dựa trên MSP.
     * Ném lỗi nếu MSP của client gọi không nằm trong danh sách được phép.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string[]} allowedMSPs Một mảng các ID MSP được phép gọi hàm.
     * @returns {string} ID MSP của client gọi.
     */
    _requireMSP(ctx, allowedMSPs) {
        const mspId = ctx.clientIdentity.getMSPID();
        if (!allowedMSPs.includes(mspId)) {
            throw new Error(`Quyền bị từ chối cho MSP: ${mspId}. Chỉ ${allowedMSPs.join(', ')} được phép.`);
        }
        return mspId;
    }

    /**
     * Băm một chuỗi đã cho để tạo ID ngắn, duy nhất.
     * @param {string} str Chuỗi cần băm.
     * @returns {string} Một chuỗi băm thập lục phân 16 ký tự.
     */
    _hashId(str) {
        return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
    }

    /**
     * Tạo một bản ghi lô thuốc mới trên sổ cái.
     * Chỉ có thể gọi bởi ManufacturerMSP.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} medicineId ID của thuốc.
     * @param {string} batchId ID lô của thuốc.
     * @param {string} manufacturerId ID của nhà sản xuất.
     * @param {string} productionDate Ngày sản xuất (ví dụ: YYYY-MM-DD).
     * @param {string} expiryDate Ngày hết hạn (ví dụ: YYYY-MM-DD).
     * @param {number} quantity Tổng số lượng được sản xuất trong lô này.
     * @returns {string} Chuỗi JSON của bản ghi thuốc đã tạo.
     */
    async createMedicine(ctx, medicineId, batchId, manufacturerId, productionDate, expiryDate, quantity) {
        this._requireMSP(ctx, ['ManufacturerMSP']);

        const rawLog = `CREATE_${medicineId}_${batchId}_${Date.now()}`;
        const logId = this._hashId(rawLog);

        const numericQuantity = Number(quantity);
        if (isNaN(numericQuantity) || numericQuantity <= 0) {
            throw new Error('Số lượng phải là một số dương.');
        }

        const medicine = {
            action: 'CREATE',
            logId,
            medicineId,
            batchId,
            manufacturerId,
            productionDate,
            expiryDate,
            totalQuantity: numericQuantity,
            distributedQuantities: {
                [manufacturerId]: numericQuantity
            },
            consumedQuantity: 0,
            consumptionDetails: {},
            parentLogId: null,
            // childrenLogIds: [] // Tạm thời bỏ childrenLogIds để giữ mô hình nhất quán với Fabric
        };

        await ctx.stub.putState(logId, Buffer.from(JSON.stringify(medicine)));
        console.info(`Lô thuốc đã được tạo: ${logId}`);
        return JSON.stringify(medicine);
    }

    /**
     * Chuyển số lượng thuốc từ một thực thể này sang thực thể khác.
     * Có thể gọi bởi ManufacturerMSP, StorageAMSP và StorageBMSP.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} parentLogId ID log của bản ghi thuốc cha từ đó số lượng được chuyển.
     * @param {string} fromId ID của thực thể chuyển thuốc.
     * @param {string} toId ID của thực thể nhận thuốc.
     * @param {string} transferCompanyId ID của công ty thực hiện chuyển (ví dụ: công ty vận chuyển).
     * @param {number} quantity Số lượng thuốc cần chuyển.
     * @returns {string} Chuỗi JSON của bản ghi thuốc mới biểu thị việc nhập kho.
     */
    async transferQuantity(ctx, parentLogId, fromId, toId, transferCompanyId, quantity) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'StorageAMSP', 'StorageBMSP']);

        const medicineBytes = await ctx.stub.getState(parentLogId);
        if (!medicineBytes || medicineBytes.length === 0) {
            throw new Error(`Không tìm thấy thuốc cha với logId ${parentLogId}`);
        }

        const parent = JSON.parse(medicineBytes.toString());

        const amount = Number(quantity);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Số lượng chuyển phải là một số dương.');
        }

        if (!parent.distributedQuantities[fromId] || parent.distributedQuantities[fromId] < amount) {
            throw new Error(`Không đủ số lượng tại ${fromId} để chuyển.`);
        }

        // Trừ số lượng hàng khỏi fromId trong bản ghi cha
        parent.distributedQuantities[fromId] -= amount;
        
        // Cập nhật bản ghi cha trên sổ cái
        await ctx.stub.putState(parentLogId, Buffer.from(JSON.stringify(parent)));

        // Tạo một ID log duy nhất cho sự kiện chuyển kho này
        const rawLog = `INBOUND_${parentLogId}_${toId}_${Date.now()}`;
        const newLogId = this._hashId(rawLog);

        const newMedicine = {
            action: 'INBOUND',
            logId: newLogId,
            parentLogId: parentLogId,
            medicineId: parent.medicineId,
            batchId: parent.batchId,
            transferCompanyId,
            fromId,
            toId,
            manufacturerId: parent.manufacturerId,
            productionDate: parent.productionDate, // Kế thừa từ cha
            expiryDate: parent.expiryDate, // Kế thừa từ cha
            timestamp: new Date().toISOString(), // Thời điểm chuyển kho
            totalQuantity: amount, // Số lượng được chuyển trong sự kiện cụ thể này
            distributedQuantities: { [toId]: amount }, // Số lượng đã chuyển hiện được phân phối cho thực thể 'toId'
            consumedQuantity: 0,
            consumptionDetails: {},
            // childrenLogIds: [] // Tạm thời bỏ childrenLogIds để giữ mô hình nhất quán với Fabric
        };

        await ctx.stub.putState(newLogId, Buffer.from(JSON.stringify(newMedicine)));
        console.info(`Thuốc đã được chuyển: ${parentLogId} -> ${newLogId}`);
        return JSON.stringify(newMedicine);
    }

    /**
     * Tạo một yêu cầu mới từ nhà thuốc.
     * Chỉ có thể gọi bởi PharmacyMSP.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} pharmacyId ID của nhà thuốc gửi yêu cầu.
     * @param {string} distributorId ID của nhà phân phối mà yêu cầu được gửi đến.
     * @param {Array<Object>} items Một mảng các đối tượng chứa chi tiết thuốc (medicineId, batchId, quantity).
     * @returns {string} Chuỗi JSON của yêu cầu đã tạo.
     */
    async createPharmacyRequest(ctx, pharmacyId, distributorId, items) {
        this._requireMSP(ctx, ['PharmacyMSP']);

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('Items phải là một mảng không rỗng.');
        }
        for (const item of items) {
            if (!item.medicineId || typeof item.medicineId !== 'string') throw new Error('Mỗi mục phải có medicineId hợp lệ (chuỗi).');
            if (!item.batchId || typeof item.batchId !== 'string') throw new Error('Mỗi mục phải có batchId hợp lệ (chuỗi).'); 
            const qty = Number(item.quantity);
            if (isNaN(qty) || qty <= 0) throw new Error('Mỗi mục phải có số lượng dương hợp lệ.');
        }

        const requestId = this._hashId(`REQUEST_${pharmacyId}_${distributorId}_${Date.now()}`);
        const request = {
            requestId,
            pharmacyId,
            distributorId,
            items: items.map(item => ({
                medicineId: item.medicineId,
                quantity: Number(item.quantity),
                status: "PENDING", // Trạng thái ban đầu cho từng mục
                fulfilledQuantity: 0 // Theo dõi số lượng đã được cấp phát cho mục này
            })),
            status: "PENDING", // Trạng thái tổng thể của yêu cầu
            timestamp: new Date().toISOString()
        };

        await ctx.stub.putState(requestId, Buffer.from(JSON.stringify(request)));
        console.info(`Yêu cầu nhà thuốc đã được tạo: ${requestId}`);
        return JSON.stringify(request);
    }

    /**
     * Phê duyệt và xử lý yêu cầu từ nhà thuốc, cấp phát các mặt hàng từ kho có sẵn.
     * Hàm này sẽ lặp qua các mặt hàng được phê duyệt trong yêu cầu, tìm các bản ghi thuốc phù hợp
     * từ nhà phân phối, cập nhật số lượng của chúng và tạo các giao dịch PharmacyDelivery mới.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} requestId ID của yêu cầu nhà thuốc cần phê duyệt.
     * @param {string} comfingRequest Một chuỗi JSON chứa mảng các chỉ số của các mục cần được phê duyệt (ví dụ: "[0, 2, 5]").
     * @returns {string} Chuỗi JSON tóm tắt quá trình phê duyệt và các giao dịch đã tạo.
     */
    async approvePharmacyRequest(ctx, requestId, comfingRequest) {
        // Chỉ cho phép các MSP của kho (nhà phân phối) phê duyệt yêu cầu.
        this._requireMSP(ctx, ['StorageAMSP', 'StorageBMSP']);

        const requestBytes = await ctx.stub.getState(requestId);
        if (!requestBytes || requestBytes.length === 0) {
            throw new Error(`❌ Yêu cầu ID ${requestId} không tồn tại.`);
        }

        const request = JSON.parse(requestBytes.toString());

        if (request.status !== 'PENDING') {
            throw new Error(`❌ Yêu cầu ${requestId} đã được xử lý rồi (trạng thái: ${request.status}).`);
        }

        let approvedItemIndices;
        try {
            approvedItemIndices = JSON.parse(comfingRequest);
            if (!Array.isArray(approvedItemIndices)) {
                throw new Error('Định dạng comfingRequest không hợp lệ. Phải là một mảng JSON.');
            }
        } catch (e) {
            throw new Error(`Lỗi phân tích comfingRequest: ${e.message}. Vui lòng cung cấp dưới dạng mảng JSON (ví dụ: "[0, 2, 5]").`);
        }
        
        const createdDeliveryTransactions = [];
        let totalApprovedItems = 0;
        let totalFulfilledItems = 0; // Số lượng mục được cấp phát đầy đủ
        let anyPartiallyFulfilled = false; // Có bất kỳ mục nào được cấp phát một phần không

        // Lấy tất cả các bản ghi thuốc từ sổ cái một lần.
        const allMedicineLogsIterator = await ctx.stub.getStateByRange('', '');
        const allMedicineLogs = [];
        let iterResult = await allMedicineLogsIterator.next();
        while (!iterResult.done) {
            const rawValue = iterResult.value.value.toString('utf8');
            if (rawValue) {
                try {
                    const medicine = JSON.parse(rawValue);
                    // Lọc bản ghi medicine để đảm bảo hợp lệ và có thuộc tính phân phối
                    if (medicine.medicineId && medicine.batchId && medicine.distributedQuantities) {
                        allMedicineLogs.push(medicine);
                    }
                } catch (err) {
                    console.error(`Lỗi phân tích JSON trong quá trình lấy tất cả các bản ghi thuốc: ${err.message}`);
                }
            }
            iterResult = await allMedicineLogsIterator.next();
        }

        // Lặp qua từng mục trong yêu cầu gốc.
        for (let i = 0; i < request.items.length; i++) {
            const item = request.items[i];

            if (approvedItemIndices.includes(i)) { // Kiểm tra xem mục này có được đánh dấu để phê duyệt không
                totalApprovedItems++;
                let remainingToFulfill = item.quantity;
                let itemFulfilledQuantity = 0;

                // Tìm các bản ghi thuốc phù hợp từ nhà phân phối (request.distributorId)
                // Lọc theo medicineId, batchId và kiểm tra xem nhà phân phối có tồn kho trong bản ghi đó không.
                // Sắp xếp theo expiryDate (ngày hết hạn sớm nhất) để ưu tiên FIFO (First In, First Out)
                const availableLogsForThisItem = allMedicineLogs.filter(log =>
                    log.medicineId === item.medicineId &&
                    log.batchId === item.batchId && // Khớp cả batch ID
                    (log.distributedQuantities[request.distributorId] || 0) > 0 // Đảm bảo nhà phân phối có số lượng
                ).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()); 

                console.info(`Tìm thấy ${availableLogsForThisItem.length} bản ghi cho ${item.medicineId} lô ${item.batchId} tại ${request.distributorId}`);

                // Duyệt qua các lô có sẵn để cấp phát thuốc
                for (const availableLog of availableLogsForThisItem) {
                    if (remainingToFulfill <= 0) break; // Mục đã được cấp phát đủ

                    const currentLogQuantity = availableLog.distributedQuantities[request.distributorId];
                    const quantityToTakeFromThisLog = Math.min(remainingToFulfill, currentLogQuantity);

                    if (quantityToTakeFromThisLog > 0) {
                        // 1. Cập nhật số lượng đã phân phối của bản ghi thuốc nguồn
                        availableLog.distributedQuantities[request.distributorId] -= quantityToTakeFromThisLog;
                        await ctx.stub.putState(availableLog.logId, Buffer.from(JSON.stringify(availableLog)));
                        console.info(`Đã cập nhật bản ghi ${availableLog.logId}: ${currentLogQuantity} -> ${availableLog.distributedQuantities[request.distributorId]}`);

                        // 2. Tạo một giao dịch PharmacyDelivery mới
                        // LogId của giao dịch là băm của (logId của lô thuốc được chuyển + Mã cửa hàng + thời điểm hiện tại + số ngẫu nhiên)
                        const logId = this._hashId(`${availableLog.logId}_${request.pharmacyId}_${Date.now()}_${Math.random()}`); 
                        const deliveryTx = {
                            logId,
                            fromId: request.distributorId,
                            toId: request.pharmacyId,
                            medicineId: item.medicineId,
                            batchId: availableLog.batchId, 
                            quantity: quantityToTakeFromThisLog,
                            timestamp: new Date().toISOString(),
                            action: 'PharmacyDelivery',
                            relatedRequest: requestId,
                            parentLogId: availableLog.logId // Liên kết đến bản ghi lô thuốc cụ thể mà từ đó số lượng này được lấy
                        };
                        await ctx.stub.putState(txId, Buffer.from(JSON.stringify(deliveryTx)));
                        createdDeliveryTransactions.push(deliveryTx);
                        console.info(`Đã tạo giao dịch cấp phát ${txId} cho ${quantityToTakeFromThisLog} đơn vị thuốc ${item.medicineId}`);

                        // 3. Cập nhật theo dõi cấp phát cho mục
                        remainingToFulfill -= quantityToTakeFromThisLog;
                        itemFulfilledQuantity += quantityToTakeFromThisLog;
                    }
                }

                // Cập nhật trạng thái của từng mục dựa trên kết quả cấp phát
                item.fulfilledQuantity = itemFulfilledQuantity;
                if (remainingToFulfill <= 0) {
                    item.status = "FULFILLED";
                    totalFulfilledItems++; // Tăng số mục được cấp phát đầy đủ
                } else if (itemFulfilledQuantity > 0) {
                    item.status = "PARTIALLY_FULFILLED";
                    anyPartiallyFulfilled = true; // Đánh dấu có mục nào đó được cấp phát một phần
                } else {
                    item.status = "UNFULFILLED"; // Được phê duyệt nhưng không tìm thấy kho
                }
            } else {
                item.status = "REJECTED"; // Không nằm trong comfingRequest, tức là không được phê duyệt
            }
        }

        // Xác định trạng thái tổng thể của yêu cầu
        if (totalApprovedItems === 0) {
            request.status = "REJECTED"; // Không có mục nào được phê duyệt ngay từ đầu
        } else if (totalFulfilledItems === totalApprovedItems && !anyPartiallyFulfilled) {
            request.status = "FULFILLED"; // Tất cả các mục được phê duyệt đều được cấp phát đầy đủ
        } else {
            request.status = "PARTIALLY_FULFILLED"; // Một số hoặc tất cả các mục được phê duyệt đều được cấp phát một phần, hoặc một số không được cấp phát chút nào
        }

        request.approvedAt = new Date().toISOString();
        await ctx.stub.putState(requestId, Buffer.from(JSON.stringify(request)));

        console.info(`✅ Yêu cầu ${requestId} đã được xử lý. Trạng thái tổng thể: ${request.status}`);

        return JSON.stringify({
            requestId,
            overallStatus: request.status,
            items: request.items, // Trả về các mục với trạng thái đã cập nhật của chúng
            deliveryTransactions: createdDeliveryTransactions // Các giao dịch cấp phát đã tạo
        });
    }

    /**
     * Ghi lại việc tiêu thụ số lượng thuốc tại một địa điểm cụ thể.
     * Có thể gọi bởi PharmacyMSP, StorageAMSP và StorageBMSP.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} logId ID log của bản ghi thuốc đang được tiêu thụ.
     * @param {string} locationId ID của thực thể tiêu thụ/bán thuốc.
     * @param {string} consumerId ID của người tiêu dùng (ví dụ: ID bệnh nhân, ID bệnh viện).
     * @param {number} quantity Số lượng thuốc đã tiêu thụ.
     * @param {number} price Giá mà thuốc đã được tiêu thụ/bán.
     * @returns {string} Chuỗi JSON của bản ghi thuốc đã cập nhật.
     */
    async consumeQuantity(ctx, logId, locationId, consumerId, quantity, price) {
        this._requireMSP(ctx, ['PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);

        const medicineBytes = await ctx.stub.getState(logId);
        if (!medicineBytes || medicineBytes.length === 0) {
            throw new Error(`Không tìm thấy thuốc ${logId}`);
        }

        const medicine = JSON.parse(medicineBytes.toString());
        const amount = Number(quantity);
        const numericPrice = Number(price);

        if (isNaN(amount) || amount <= 0) {
            throw new Error('Số lượng tiêu thụ phải là một số dương.');
        }
        if (isNaN(numericPrice) || numericPrice < 0) {
            throw new Error('Giá phải là một số không âm.');
        }

        if (!medicine.distributedQuantities[locationId] || medicine.distributedQuantities[locationId] < amount) {
            throw new Error(`Không đủ thuốc tại ${locationId} để tiêu thụ.`);
        }

        medicine.distributedQuantities[locationId] -= amount;
        medicine.consumedQuantity += amount;

        if (!medicine.consumptionDetails) {
            medicine.consumptionDetails = {};
        }

        if (!medicine.consumptionDetails[locationId]) {
            medicine.consumptionDetails[locationId] = {};
        }

        if (!medicine.consumptionDetails[locationId][consumerId]) {
            medicine.consumptionDetails[locationId][consumerId] = [];
        }

        medicine.consumptionDetails[locationId][consumerId].push({
            quantity: amount,
            price: numericPrice,
            timestamp: new Date().toISOString()
        });

        await ctx.stub.putState(logId, Buffer.from(JSON.stringify(medicine)));
        console.info(`Thuốc đã được tiêu thụ từ ${logId} tại ${locationId}`);
        return JSON.stringify(medicine);
    }

    /**
     * Truy xuất một bản ghi thuốc duy nhất bằng ID log của nó.
     * Có thể gọi bởi ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} logId ID log duy nhất của bản ghi thuốc.
     * @returns {string} Chuỗi JSON của bản ghi thuốc.
     */
    async getMedicineBylogId(ctx, logId) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);

        const chain = [];
        let currentLogId = logId;

        while (currentLogId) {
            const medicineBytes = await ctx.stub.getState(currentLogId);

            if (!medicineBytes || medicineBytes.length === 0) {
                throw new Error(`Không tìm thấy thuốc với logId ${currentLogId} trong chuỗi.`);
            }

            const medicine = JSON.parse(medicineBytes.toString());
            chain.push(medicine);

            // Dừng nếu không có parentLogId hoặc chính nó là gốc (để tránh vòng lặp vô hạn nếu có lỗi logic)
            if (!medicine.parentLogId) { // Chỉ dừng khi parentLogId là null
                break;
            }
            if (medicine.parentLogId === currentLogId) { // Đảm bảo không có vòng lặp vô hạn nếu có lỗi dữ liệu
                console.warn(`Lỗi: parentLogId của ${currentLogId} trỏ về chính nó. Dừng truy vết để tránh vòng lặp vô hạn.`);
                break;
            }

            currentLogId = medicine.parentLogId;
        }

        // Trả về từ gốc -> con (đảo ngược thứ tự để có lịch sử từ đầu)
        return JSON.stringify(chain.reverse());
    }

    /**
     * Truy xuất tất cả các bản ghi thuốc trên sổ cái.
     * Có thể gọi bởi ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP.
     * Lưu ý: Đối với các sổ cái rất lớn, hãy cân nhắc sử dụng truy vấn nâng cao với CouchDB để tăng hiệu quả.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @returns {string} Mảng chuỗi JSON của tất cả các bản ghi thuốc.
     */
    async getAllMedicines(ctx) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);
        const iterator = await ctx.stub.getStateByRange('', ''); // Lấy tất cả các khóa trong sổ cái
        const allMedicines = [];

        let result = await iterator.next();
        while (!result.done) {
            const rawValue = result.value.value.toString('utf8');

            if (!rawValue) {
                console.warn(`Tìm thấy giá trị rỗng cho khóa ${result.value.key}`);
            } else {
                try {
                    const medicine = JSON.parse(rawValue);
                    if (medicine.medicineId && medicine.batchId) { // Đảm bảo đó là bản ghi thuốc
                        allMedicines.push(medicine);
                    }
                } catch (err) {
                    console.error(`JSON không hợp lệ tại khóa ${result.value.key}:`, err.message);
                }
            }
            result = await iterator.next();
        }
        console.info(`Đã truy xuất ${allMedicines.length} bản ghi thuốc.`);
        return JSON.stringify(allMedicines);
    }

    /**
     * Truy vết toàn bộ lịch sử của một lô thuốc từ khi tạo cho đến trạng thái hiện tại.
     * Có thể gọi bởi ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} targetLogId ID log của bản ghi thuốc cần truy vết.
     * @returns {string} Chuỗi JSON chứa đường dẫn truy vết và dữ liệu đầy đủ của các bản ghi liên quan.
     */
    async traceMedicineByLogId(ctx, targetLogId) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);
        
        // Lấy tất cả các bản ghi thuốc để xây dựng đường dẫn truy vết.
        const allMedicines = JSON.parse(await this.getAllMedicines(ctx)); // Gọi lại hàm getAllMedicines để tránh trùng lặp code

        // Tìm nút bắt đầu cho việc truy vết.
        let node = allMedicines.find(m => m.logId === targetLogId);
        if (!node) {
            throw new Error(`Không tìm thấy thuốc với logId ${targetLogId} trong sổ cái.`);
        }

        // Xây dựng đường dẫn truy vết bằng cách theo các liên kết parentLogId (liên kết ngược).
        const path = [node];
        let current = node;
        while (current.parentLogId) {
            const parent = allMedicines.find(m => m.logId === current.parentLogId);
            if (!parent) {
                console.warn(`Không tìm thấy parent logId ${current.parentLogId} cho logId ${current.logId}. Đường dẫn truy vết có thể không đầy đủ.`);
                break; 
            }
            path.unshift(parent); 
            current = parent;
        }

        // Định dạng đường dẫn truy vết để dễ hiểu hơn.
        const formattedTracePath = path.map((logEntry, index) => {
            let fromEntity = 'Unknown';
            let toEntity = 'Unknown';
            // Ưu tiên productionDate nếu là CREATE, nếu không thì dùng timestamp (nếu có) hoặc thời điểm hiện tại
            let timestamp = logEntry.productionDate || logEntry.timestamp || new Date().toISOString(); 

            if (logEntry.action === 'CREATE') {
                fromEntity = 'Nguồn gốc (Nhà sản xuất)';
                toEntity = logEntry.manufacturerId; 
            } else if (logEntry.action === 'INBOUND') {
                fromEntity = logEntry.fromId || 'Người giữ trước đó'; 
                toEntity = logEntry.toId || Object.keys(logEntry.distributedQuantities || {})[0]; 
                timestamp = logEntry.timestamp || new Date().toISOString(); 
            } else if (logEntry.action === 'CONSUME') { 
                fromEntity = logEntry.locationId;
                toEntity = 'Người tiêu dùng cuối';
                timestamp = logEntry.timestamp || new Date().toISOString();
            }

            let quantityInvolved = 0;
            if (logEntry.action === 'CREATE' || logEntry.action === 'INBOUND') {
                quantityInvolved = logEntry.totalQuantity || 0;
            } else if (logEntry.consumedQuantity !== undefined && logEntry.consumedQuantity > 0) {
                 quantityInvolved = logEntry.consumedQuantity;
            }
            // Thêm các trường khác cần thiết để hiển thị thông tin chi tiết hơn về logEntry.
            // Ví dụ, hiển thị distributedQuantities hiện tại của logEntry này.
            const currentDistributed = Object.entries(logEntry.distributedQuantities || {}).map(([key, value]) => `${key}: ${value}`).join(', ');

            return {
                action: logEntry.action,
                logId: logEntry.logId,
                medicineId: logEntry.medicineId,
                batchId: logEntry.batchId,
                from: fromEntity,
                to: toEntity,
                quantity: quantityInvolved,
                currentHoldings: currentDistributed, // Thêm thông tin về số lượng hiện tại
                timestamp: timestamp
            };
        });

        console.info(`Đã hoàn thành truy vết cho logId: ${targetLogId}`);
        return JSON.stringify({
            tracePath: formattedTracePath,
            fullData: path 
        });
    }
}

module.exports = SupplyChainContract;
