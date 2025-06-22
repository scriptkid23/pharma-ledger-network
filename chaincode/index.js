'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

class SupplyChainContract extends Contract {
    /**
     * Hàm trợ giúp để thực thi kiểm soát truy cập dựa trên MSP.
     * Ném lỗi nếu MSP của client gọi không nằm trong danh sách được phép.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string[]} allowedMSPs Một mảng các ID MSP được phép cho phép gọi hàm.
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
     * @param {string} productionDate Ngày sản xuất (ví dụ:YYYY-MM-DD).
     * @param {string} expiryDate Ngày hết hạn (ví dụ:YYYY-MM-DD).
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
            distributedQuantities: numericQuantity, 
            consumedQuantity: 0,
            consumptionDetails: [], 
            parentLogId: null,
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
        this._requireMSP(ctx, ['StorageAMSP', 'StorageBMSP']);

        const medicineBytes = await ctx.stub.getState(parentLogId);
        if (!medicineBytes || medicineBytes.length === 0) {
            throw new Error(`Không tìm thấy thuốc cha với logId ${parentLogId}`);
        }

        const parent = JSON.parse(medicineBytes.toString());

        const amount = Number(quantity);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Số lượng chuyển phải là một số dương.');
        }

        let parentOwnerId;
        if (parent.action === 'CREATE') {
            parentOwnerId = parent.manufacturerId;
        } else if (parent.action === 'INBOUND') {
            parentOwnerId = parent.toId;
        } else {
            throw new Error(`Không thể chuyển từ bản ghi có hành động ${parent.action}.`);
        }

        if (parentOwnerId !== fromId) {
            throw new Error(`Thực thể ${fromId} không sở hữu số lượng trong bản ghi ${parentLogId}. Chủ sở hữu hiện tại là ${parentOwnerId}.`);
        }

        if (parent.distributedQuantities < amount) {
            throw new Error(`Không đủ số lượng tại ${fromId} để chuyển. Chỉ còn ${parent.distributedQuantities}.`);
        }

        parent.distributedQuantities -= amount;
        
        if (!Array.isArray(parent.consumptionDetails)) {
            parent.consumptionDetails = []; 
        }
        parent.consumptionDetails.push({
            type: 'TRANSFER_OUT', 
            toId: toId, 
            quantity: amount,
            timestamp: new Date().toISOString()
        });
        
        await ctx.stub.putState(parentLogId, Buffer.from(JSON.stringify(parent)));
        console.info(`Đã cập nhật distributedQuantities của bản ghi cha ${parentLogId}: còn ${parent.distributedQuantities}. Đã ghi lại sự kiện chuyển đi.`);


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
            productionDate: parent.productionDate, 
            expiryDate: parent.expiryDate, 
            timestamp: new Date().toISOString(), 
            totalQuantity: amount, 
            distributedQuantities: amount, 
            consumedQuantity: 0,
            consumptionDetails: [], 
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
     * @param {string} itemsJsonString Chuỗi JSON của một mảng các đối tượng chứa chi tiết thuốc (medicineId, quantity, và OPTIONAL batchId).
     * @returns {string} Chuỗi JSON của yêu cầu đã tạo.
     */
    async createPharmacyRequest(ctx, pharmacyId, distributorId, itemsJsonString) {
        this._requireMSP(ctx, ['PharmacyMSP']);

        let items;
        try {
            items = JSON.parse(itemsJsonString);
        } catch (e) {
            throw new Error(`Định dạng JSON không hợp lệ cho 'items': ${e.message}`);
        }

        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('Items phải là một mảng không rỗng.');
        }
        for (const item of items) {
            if (!item.medicineId || typeof item.medicineId !== 'string') throw new Error('Mỗi mục phải có medicineId hợp lệ (chuỗi).');
            if (item.batchId && typeof item.batchId !== 'string') throw new Error('Nếu có batchId, nó phải là chuỗi hợp lệ.');
            
            const qty = Number(item.quantity);
            if (isNaN(qty) || qty <= 0) throw new Error('Mỗi mục phải có số lượng dương hợp lệ.');
        }

        const requestId = this._hashId(`REQUEST_${pharmacyId}_${distributorId}_${Date.now()}`);
        const request = {
            action: "PharmacyRequest",
            requestId,
            pharmacyId,
            distributorId,
            items: items.map(item => ({
                medicineId: item.medicineId,
                batchId: item.batchId || null,
                quantity: Number(item.quantity),
                status: "PENDING",
                fulfilledQuantity: 0
            })),
            status: "PENDING",
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
        console.log(`[DEBUG] Bắt đầu approvePharmacyRequest cho Request ID: ${requestId}`);
        this._requireMSP(ctx, ['StorageAMSP', 'StorageBMSP']);

        const requestBytes = await ctx.stub.getState(requestId);
        if (!requestBytes || requestBytes.length === 0) {
            console.error(`[DEBUG] Lỗi: Yêu cầu ID ${requestId} không tồn tại.`);
            throw new Error(`Yêu cầu ID ${requestId} không tồn tại.`);
        }

        const request = JSON.parse(requestBytes.toString());
        console.log(`[DEBUG] Đã lấy request: ${JSON.stringify(request)}`);
        console.log(`[DEBUG] Distributor ID từ request: ${request.distributorId}`); 

        if (request.status !== 'PENDING') {
            console.error(`[DEBUG] Lỗi: Yêu cầu ${requestId} đã được xử lý rồi (trạng thái: ${request.status}).`);
            throw new Error(`Yêu cầu ${requestId} đã được xử lý rồi (trạng thái: ${request.status}).`);
        }

        let approvedItemIndices;
        try {
            approvedItemIndices = JSON.parse(comfingRequest);
            if (!Array.isArray(approvedItemIndices)) {
                console.error(`[DEBUG] Lỗi: Định dạng comfingRequest không hợp lệ. Phải là một mảng JSON: ${comfingRequest}`);
                throw new Error('Định dạng comfingRequest không hợp lệ. Phải là một mảng JSON.');
            }
            console.log(`[DEBUG] approvedItemIndices: ${JSON.stringify(approvedItemIndices)}`);
        } catch (e) {
            console.error(`[DEBUG] Lỗi phân tích comfingRequest: ${e.message}. comfingRequest: ${comfingRequest}`);
            throw new Error(`Lỗi phân tích comfingRequest: ${e.message}. Vui lòng cung cấp dưới dạng mảng JSON (ví dụ: "[0, 2, 5]").`);
        }
        
        const createdDeliveryTransactions = [];
        // `totalApprovedItems` và `totalFulfilledItems` không còn được dùng trực tiếp để xác định trạng thái tổng thể cuối cùng.
        // Thay vào đó, chúng ta sẽ duyệt qua `request.items` sau khi cập nhật từng mục.

        const allRecordsFromLedger = JSON.parse(await this.getAllMedicines(ctx));
        console.log(`[DEBUG] Tổng số bản ghi từ ledger (từ getAllMedicines): ${allRecordsFromLedger.length}`);

        // Lọc ra các bản ghi tồn kho thực tế (CREATE hoặc INBOUND)
        const currentStockLogs = allRecordsFromLedger.filter(record => {
            const isCreateOrInbound = (record.action === 'CREATE' || record.action === 'INBOUND');
            const hasPositiveDistributedQuantity = typeof record.distributedQuantities === 'number' && record.distributedQuantities > 0;
            const isValidStockRecord = isCreateOrInbound && hasPositiveDistributedQuantity;

            console.log(`[DEBUG-STOCK_FILTER] Đánh giá bản ghi ${record.logId || record.txId}: Action=${record.action}, distributedQuantities=${record.distributedQuantities}, IsCreateOrInbound=${isCreateOrInbound}, HasPositiveDistributedQuantity=${hasPositiveDistributedQuantity}, Result=${isValidStockRecord}`);
            if (!isValidStockRecord) {
                console.log(`[DEBUG-STOCK_FILTER]   -- Loại trừ: ${record.logId || record.txId}`);
            }

            return isValidStockRecord;
        });
        console.log(`[DEBUG] Tổng số bản ghi tồn kho hợp lệ (CREATE/INBOUND) sau lọc: ${currentStockLogs.length}`);


        // Lặp qua từng mục trong yêu cầu gốc.
        for (let i = 0; i < request.items.length; i++) {
            const item = request.items[i];
            console.log(`[DEBUG] Đang xử lý mục [${i}]: medicineId=${item.medicineId}, quantity=${item.quantity}, batchId=${item.batchId || 'N/A'}`);

            if (approvedItemIndices.includes(i)) { 
                let remainingToFulfill = item.quantity;
                let itemFulfilledQuantity = 0;
                console.log(`[DEBUG] Mục [${i}] đã được phê duyệt. Số lượng cần cấp phát: ${remainingToFulfill}`);

                // Tìm các bản ghi thuốc phù hợp từ nhà phân phối (request.distributorId)
                // Lọc từ currentStockLogs để chỉ xem xét các bản ghi tồn kho hợp lệ
                const availableLogsForThisItem = currentStockLogs.filter(log => {
                    const isMedicineMatch = log.medicineId === item.medicineId;
                    
                    // Xác định chủ sở hữu chính của log (người giữ thuốc)
                    let logOwnerId = null;
                    if (log.action === 'CREATE') {
                        logOwnerId = log.manufacturerId;
                    } else if (log.action === 'INBOUND') {
                        logOwnerId = log.toId;
                    }

                    // *** ĐIỀU CHỈNH ĐỂ KHỚP VỚI NHÀ PHÂN PHỐI HOẶC CÔNG TY CHUYỂN GIAO ***
                    // Kiểm tra xem yêu cầu có thể được cấp phát bởi logOwnerId HOẶC transferCompanyId (nếu có)
                    const isHeldByDistributor = (logOwnerId === request.distributorId || log.transferCompanyId === request.distributorId) && log.distributedQuantities > 0;
                    
                    // Nếu batchId được chỉ định trong yêu cầu, nó phải khớp chính xác
                    let isBatchMatch = true;
                    if (item.batchId) {
                        isBatchMatch = log.batchId === item.batchId;
                    } 
                    
                    console.log(`[DEBUG-ITEM_FILTER]   Đánh giá tồn kho Log ${log.logId} cho mục ${item.medicineId} (batch: ${item.batchId || 'any'})`);
                    console.log(`[DEBUG-ITEM_FILTER]     medicineId của log: ${log.medicineId}, item.medicineId: ${item.medicineId}, isMedicineMatch: ${isMedicineMatch}`);
                    console.log(`[DEBUG-ITEM_FILTER]     Chủ sở hữu log: ${logOwnerId}, Distributor ID yêu cầu: ${request.distributorId}, transferCompanyId của log: ${log.transferCompanyId || 'N/A'}, isHeldByDistributor: ${isHeldByDistributor} (quantity: ${log.distributedQuantities})`);
                    console.log(`[DEBUG-ITEM_FILTER]     batchId của log: ${log.batchId}, item.batchId: ${item.batchId || 'N/A'}, isBatchMatch: ${isBatchMatch}`);
                    console.log(`[DEBUG-ITEM_FILTER]     Kết quả lọc tổng thể: ${isMedicineMatch && isHeldByDistributor && isBatchMatch}`);

                    return isMedicineMatch && isHeldByDistributor && isBatchMatch;
                }).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()); 


                console.info(`[DEBUG] Tìm thấy ${availableLogsForThisItem.length} bản ghi tồn kho phù hợp cho ${item.medicineId} lô ${item.batchId || 'bất kỳ'} tại ${request.distributorId}`);
                if (availableLogsForThisItem.length === 0) {
                    console.warn(`[DEBUG] Cảnh báo: Không tìm thấy tồn kho khả dụng cho mục ${item.medicineId} lô ${item.batchId || 'bất kỳ'} tại ${request.distributorId}`);
                }

                for (const availableLog of availableLogsForThisItem) {
                    if (remainingToFulfill <= 0) {
                        console.log(`[DEBUG]   Mục đã được cấp phát đủ. Dừng duyệt các lô khác.`);
                        break; 
                    }

                    const currentLogQuantity = availableLog.distributedQuantities; 
                    const quantityToTakeFromThisLog = Math.min(remainingToFulfill, currentLogQuantity);
                    console.log(`[DEBUG]   Đang xử lý lô ${availableLog.logId}. Tồn kho hiện tại: ${currentLogQuantity}, Số lượng cần lấy: ${quantityToTakeFromThisLog}`);


                    if (quantityToTakeFromThisLog > 0) {
                        availableLog.distributedQuantities -= quantityToTakeFromThisLog; 
                        
                        if (!Array.isArray(availableLog.consumptionDetails)) {
                            availableLog.consumptionDetails = [];
                        }
                        availableLog.consumptionDetails.push({
                            type: 'DELIVER_OUT', 
                            toId: request.pharmacyId, 
                            quantity: quantityToTakeFromThisLog,
                            relatedRequestId: requestId, 
                            timestamp: new Date().toISOString()
                        });

                        await ctx.stub.putState(availableLog.logId, Buffer.from(JSON.stringify(availableLog)));
                        console.info(`[DEBUG]   Đã cập nhật bản ghi tồn kho ${availableLog.logId}: Số lượng mới còn ${availableLog.distributedQuantities}. Đã ghi lại sự kiện cấp phát.`);

                        // Lấy ownerId từ availableLog
                        let availableLogOwnerId = null;
                        if (availableLog.action === 'CREATE') {
                            availableLogOwnerId = availableLog.manufacturerId;
                        } else if (availableLog.action === 'INBOUND') {
                            availableLogOwnerId = availableLog.toId;
                        }
                        // Fallback nếu không xác định được (mặc dù không nên xảy ra với CREATE/INBOUND)
                        availableLogOwnerId = availableLogOwnerId || availableLog.fromId || 'UnknownSource'; 

                        const deliveryTxId = this._hashId(`DELIVERY_${availableLog.logId}_${request.pharmacyId}_${Date.now()}_${Math.random()}`); 
                        const deliveryTx = {
                            action: 'PharmacyDelivery',
                            txId: deliveryTxId, // Sử dụng txId để nhất quán với bản ghi ledger
                            fromId: availableLogOwnerId, // Từ chủ sở hữu hiện tại của availableLog
                            toId: request.pharmacyId,
                            medicineId: item.medicineId,
                            batchId: availableLog.batchId,
                            quantity: quantityToTakeFromThisLog,
                            manufacturerId: availableLog.manufacturerId, // Lấy từ availableLog (đã có từ CREATE/INBOUND)
                            productionDate: availableLog.productionDate, 
                            expiryDate: availableLog.expiryDate, 
                            timestamp: new Date().toISOString(),
                            relatedRequest: requestId,
                            parentLogId: availableLog.logId,
                            distributedQuantities: quantityToTakeFromThisLog, 
                            consumedQuantity: 0,
                            consumptionDetails: [] 
                        };
                        await ctx.stub.putState(deliveryTxId, Buffer.from(JSON.stringify(deliveryTx))); // Sử dụng deliveryTxId
                        createdDeliveryTransactions.push(deliveryTx);
                        console.info(`[DEBUG]   Đã tạo giao dịch cấp phát ${deliveryTxId} cho ${quantityToTakeFromThisLog} đơn vị thuốc ${item.medicineId}.`);

                        remainingToFulfill -= quantityToTakeFromThisLog;
                        itemFulfilledQuantity += quantityToTakeFromThisLog;
                        console.log(`[DEBUG]   Số lượng còn lại cần cấp phát cho mục [${i}]: ${remainingToFulfill}, đã cấp phát cho mục: ${itemFulfilledQuantity}`);
                    } else {
                        console.log(`[DEBUG]   Không có số lượng nào để lấy từ lô ${availableLog.logId}. Bỏ qua lô này.`);
                    }
                }

                // Cập nhật trạng thái của từng mục dựa trên kết quả cấp phát
                item.fulfilledQuantity = itemFulfilledQuantity;
                if (remainingToFulfill <= 0) {
                    item.status = "FULFILLED";
                    console.log(`[DEBUG]   Mục [${i}] trạng thái: FULFILLED`);
                } else if (itemFulfilledQuantity > 0) {
                    item.status = "PARTIALLY_FULFILLED";
                    console.log(`[DEBUG]   Mục [${i}] trạng thái: PARTIALLY_FULFILLED`);
                } else {
                    item.status = "UNFULFILLED"; // Không cấp phát được gì cho mục này (dù đã được phê duyệt)
                    console.log(`[DEBUG]   Mục [${i}] trạng thái: UNFULFILLED (không cấp phát được gì)`);
                }
            } else {
                item.status = "REJECTED"; // Mục không được chọn để phê duyệt
                console.log(`[DEBUG] Mục [${i}] không được phê duyệt, trạng thái: REJECTED`);
            }
        }

        // Xác định trạng thái tổng thể của yêu cầu dựa trên TẤT CẢ các mục trong `request.items`
        let allItemsFullyFulfilled = true;
        let anyItemFulfilledOrPartially = false;
        let anyItemRejectedOrUnfulfilled = false;

        for (const item of request.items) {
            if (item.status === "FULFILLED") {
                anyItemFulfilledOrPartially = true;
            } else if (item.status === "PARTIALLY_FULFILLED") {
                allItemsFullyFulfilled = false;
                anyItemFulfilledOrPartially = true;
                anyItemRejectedOrUnfulfilled = true;
            } else if (item.status === "UNFULFILLED" || item.status === "REJECTED") {
                allItemsFullyFulfilled = false;
                anyItemRejectedOrUnfulfilled = true;
            }
        }

        if (allItemsFullyFulfilled) {
            request.status = "FULFILLED";
            console.log(`[DEBUG] Tất cả các mục trong yêu cầu gốc đã được cấp phát đầy đủ. Trạng thái yêu cầu tổng thể: FULFILLED`);
        } else if (anyItemFulfilledOrPartially) {
            request.status = "PARTIALLY_FULFILLED";
            console.log(`[DEBUG] Có mục được cấp phát một phần hoặc một số được hoàn thành, nhưng không phải tất cả. Trạng thái yêu cầu tổng thể: PARTIALLY_FULFILLED`);
        } else { // Không có mục nào được cấp phát (tất cả đều UNFULFILLED hoặc REJECTED)
            request.status = "REJECTED"; 
            console.log(`[DEBUG] Không có mục nào được cấp phát. Trạng thái yêu cầu tổng thể: REJECTED`);
        }

        request.approvedAt = new Date().toISOString();
        await ctx.stub.putState(requestId, Buffer.from(JSON.stringify(request)));

        console.info(`Yêu cầu ${requestId} đã được xử lý. Trạng thái tổng thể: ${request.status}`);
        console.log(`[DEBUG] Chi tiết các mục sau xử lý: ${JSON.stringify(request.items)}`);
        console.log(`[DEBUG] Các giao dịch giao hàng đã tạo: ${JSON.stringify(createdDeliveryTransactions)}`);


        return JSON.stringify({
            requestId,
            overallStatus: request.status,
            items: request.items, 
            deliveryTransactions: createdDeliveryTransactions 
        });
    }

    /**
     * Ghi lại việc tiêu thụ số lượng thuốc tại một địa điểm cụ thể.
     * Có thể gọi bởi PharmacyMSP, StorageAMSP và StorageBMSP.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} medicineId ID của thuốc cần tiêu thụ.
     * @param {string} locationId ID của thực thể tiêu thụ/bán thuốc (ví dụ: ID nhà thuốc).
     * @param {string} consumerId ID của người tiêu dùng (ví dụ: ID bệnh nhân, ID bệnh viện).
     * @param {number} quantity Số lượng thuốc đã tiêu thụ.
     * @param {number} price Giá mà thuốc đã được tiêu thụ/bán.
     * @param {string} [batchId] Tùy chọn: ID lô cụ thể nếu muốn tiêu thụ từ một lô nhất định.
     * @returns {string} Chuỗi JSON tóm tắt các bản ghi đã được tiêu thụ.
     */
    async _consumeQuantity(ctx, medicineId, locationId, consumerId, quantity, price, batchId = null) {
        // this._requireMSP(ctx, ['PharmacyMSP']);

        const amountToConsume = Number(quantity);
        const numericPrice = Number(price);

        if (isNaN(amountToConsume) || amountToConsume <= 0) {
            throw new Error('Số lượng tiêu thụ phải là một số dương.');
        }
        if (isNaN(numericPrice) || numericPrice < 0) {
            throw new Error('Giá phải là một số không âm.');
        }

        const allRecordsFromLedger = JSON.parse(await this.getAllMedicines(ctx));
        console.log(`[DEBUG-CONSUME] Tổng số bản ghi từ ledger: ${allRecordsFromLedger.length}`);

        // Lọc các bản ghi PharmacyDelivery thuộc về nhà thuốc hiện tại, còn số lượng, và khớp medicineId/batchId
        const availableDeliveryLogs = allRecordsFromLedger.filter(record => {
            const isDeliveryForThisPharmacy = record.action === 'PharmacyDelivery' && record.toId === locationId;
            const isMedicineMatch = record.medicineId === medicineId;
            const hasPositiveQuantity = record.distributedQuantities > 0;
            let isBatchMatch = true;
            if (batchId) { // Nếu batchId được cung cấp, phải khớp chính xác
                isBatchMatch = record.batchId === batchId;
            }

            console.log(`[DEBUG-CONSUME-FILTER] Evaluating log ${record.txId || record.logId}: action=${record.action}, toId=${record.toId}, medId=${record.medicineId}, batchId=${record.batchId}, distQty=${record.distributedQuantities}`);
            console.log(`[DEBUG-CONSUME-FILTER]   Conditions: DeliveryForThisPharmacy=${isDeliveryForThisPharmacy}, MedicineMatch=${isMedicineMatch}, PositiveQuantity=${hasPositiveQuantity}, BatchMatch=${isBatchMatch}`);
            
            return isDeliveryForThisPharmacy && isMedicineMatch && hasPositiveQuantity && isBatchMatch;
        }).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()); // Ưu tiên hết hạn sớm nhất

        console.log(`[DEBUG-CONSUME] Tìm thấy ${availableDeliveryLogs.length} lô thuốc PharmacyDelivery phù hợp cho ${medicineId} tại ${locationId}.`);

        if (availableDeliveryLogs.length === 0) {
            throw new Error(`Không tìm thấy thuốc ${medicineId}${batchId ? ` (lô: ${batchId})` : ''} tại ${locationId} để tiêu thụ.`);
        }

        let remainingToConsume = amountToConsume;
        const consumedLogs = []; // Để theo dõi các bản ghi đã tiêu thụ

        for (const medicine of availableDeliveryLogs) {
            if (remainingToConsume <= 0) {
                console.log(`[DEBUG-CONSUME] Đã tiêu thụ đủ số lượng. Dừng duyệt các lô.`);
                break;
            }

            const currentLogQuantity = medicine.distributedQuantities;
            const quantityFromThisLog = Math.min(remainingToConsume, currentLogQuantity);

            if (quantityFromThisLog > 0) {
                medicine.distributedQuantities -= quantityFromThisLog;
                medicine.consumedQuantity += quantityFromThisLog;

                if (!Array.isArray(medicine.consumptionDetails)) {
                    medicine.consumptionDetails = [];
                }
                medicine.consumptionDetails.push({
                    type: 'CONSUME',
                    locationId: locationId,
                    consumerId: consumerId,
                    quantity: quantityFromThisLog,
                    price: numericPrice,
                    timestamp: new Date().toISOString()
                });

                await ctx.stub.putState(medicine.txId, Buffer.from(JSON.stringify(medicine)));
                console.info(`[DEBUG-CONSUME] Đã tiêu thụ ${quantityFromThisLog} từ lô ${medicine.txId}. distributedQuantities còn lại: ${medicine.distributedQuantities}.`);
                
                remainingToConsume -= quantityFromThisLog;
                consumedLogs.push({ logId: medicine.txId, consumedQuantity: quantityFromThisLog, remainingQuantity: medicine.distributedQuantities });
            }
        }

        if (remainingToConsume > 0) {
            const totalAvailable = availableDeliveryLogs.reduce((sum, log) => sum + log.distributedQuantities, 0); // Tổng số lượng còn lại sau khi cố gắng tiêu thụ
            throw new Error(`Không đủ thuốc để tiêu thụ. Cần thêm ${remainingToConsume} đơn vị. Tổng số lượng có sẵn còn lại là ${totalAvailable}.`);
        }

        console.info(`Thuốc ${medicineId} đã được tiêu thụ thành công tại ${locationId}.`);
        return JSON.stringify({
            status: 'SUCCESS',
            message: `Đã tiêu thụ ${amountToConsume} đơn vị thuốc ${medicineId} tại ${locationId}.`,
            consumedLogs: consumedLogs
        });
    }

    /**
     * Processes a full prescription, creating a single SalesInvoice record and consuming
     * items from available stock. This function orchestrates multiple calls to consumeQuantity.
     *
     * @param {Context} ctx The transaction context.
     * @param {string} locationId - ID of the consuming/selling entity (e.g., pharmacy ID).
     * @param {string} consumerId - ID of the consumer (e.g., patient ID).
     * @param {string} prescriptionJsonString - JSON string containing a list of medicines purchased.
     * Example: '[{"code": "ABC123", "price": 10000, "quantity": 2}, {"code": "XYZ456", "price": 15000, "quantity": 1}]'
     * @returns {string} JSON string of the newly created SalesInvoice record.
     */
    async consumeQuantityAll(ctx, locationId, consumerId, prescriptionJsonString) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP']);

        if (!locationId || !consumerId || !prescriptionJsonString) {
            throw new Error('Missing required fields (locationId, consumerId, prescriptionJsonString).');
        }

        let prescriptionItems;
        try {
            prescriptionItems = JSON.parse(prescriptionJsonString);
            if (!Array.isArray(prescriptionItems) || prescriptionItems.length === 0) {
                throw new Error('Prescription is invalid or empty.');
            }
        } catch (error) {
            throw new Error(`Error parsing JSON prescription: ${error.message}`);
        }

        const invoiceId = ctx.stub.getTxID(); // Unique transaction ID for this invoice
        const saleTimestamp = new Date().toISOString();
        let totalAmount = 0;
        const salesInvoiceItems = [];
        const unfulfilledItems = [];

        for (const item of prescriptionItems) {
            const medicineCode = item.code;
            const requestedQuantity = item.quantity;
            const itemPrice = item.price;
            const itemBatchId = item.batchId || null;

            if (requestedQuantity <= 0) {
                unfulfilledItems.push({ 
                    medicineId: medicineCode, 
                    requestedQuantity: item.quantity,
                    fulfilledQuantity: 0,
                    remainingQuantity: item.quantity,
                    message: 'Invalid requested quantity (less than or equal to 0).' 
                });
                continue;
            }

            try {
                // Call the low-level consumeQuantity for each item
                const consumptionResultJson = await this._consumeQuantity(
                    ctx, medicineCode, locationId, consumerId, requestedQuantity, itemPrice, itemBatchId, invoiceId
                );
                const consumptionResult = JSON.parse(consumptionResultJson);

                if (consumptionResult.status === 'SUCCESS') {
                    const fulfilledQty = consumptionResult.consumedLogs.reduce((sum, log) => sum + log.consumedQuantity, 0);
                    salesInvoiceItems.push({ 
                        medicineId: medicineCode, 
                        requestedQuantity: requestedQuantity,
                        fulfilledQuantity: fulfilledQty,
                        pricePerUnit: itemPrice, 
                        totalPrice: fulfilledQty * itemPrice,
                        sourceLogIds: consumptionResult.consumedLogs.map(log => ({ logId: log.logId, quantity: log.consumedQuantity }))
                    });
                    totalAmount += fulfilledQty * itemPrice;
                } else {
                    unfulfilledItems.push({ 
                        medicineId: medicineCode, 
                        requestedQuantity: requestedQuantity,
                        fulfilledQuantity: 0, // Assuming 0 if not successful
                        remainingQuantity: requestedQuantity,
                        message: consumptionResult.message || 'Consumption failed for this item.' 
                    });
                }
            } catch (e) {
                // Catch errors from consumeQuantity and record as unfulfilled
                console.error(`Error processing item ${medicineCode} in prescription: ${e.message}`);
                unfulfilledItems.push({ 
                    medicineId: medicineCode, 
                    requestedQuantity: requestedQuantity,
                    fulfilledQuantity: 0,
                    remainingQuantity: requestedQuantity,
                    message: `Error during consumption: ${e.message}` 
                });
            }
        }

        // Determine overall invoice status
        const salesInvoice = {
            docType: 'SalesInvoice',
            invoiceId: invoiceId,
            consumerId: consumerId,
            locationId: locationId,
            timestamp: saleTimestamp,
            items: salesInvoiceItems,
            totalAmount: totalAmount,
            status: unfulfilledItems.length === 0 ? 'COMPLETED' : 'PARTIALLY_FULFILLED',
            unfulfilledItems: unfulfilledItems
        };

        await ctx.stub.putState(invoiceId, Buffer.from(JSON.stringify(salesInvoice)));
        console.info(`--- Sales Invoice ${invoiceId} created. Status: ${salesInvoice.status} ---`);
        return JSON.stringify(salesInvoice); // Return the invoice record as JSON string
    }

    /**
     * Truy vấn tất cả các bản ghi hóa đơn bán hàng (SalesInvoice).
     * @param {Context} ctx The transaction context
     * @returns {Array<Object>} Mảng các bản ghi SalesInvoice.
     */
    async getSalesInvoices(ctx) {
        console.info('--- Bắt đầu truy vấn getSalesInvoices ---');
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);

        const iterator = await ctx.stub.getStateByRange('', '');
        const results = [];

        while (true) {
            const res = await iterator.next();
            if (res.value && res.value.value.toString()) {
                let record;
                try {
                    record = JSON.parse(res.value.value.toString('utf8'));
                    if (record.docType === 'SalesInvoice') {
                        results.push(record);
                    }
                } catch (err) {
                    console.error(`Lỗi phân tích bản ghi: ${err}`);
                }
            }
            if (res.done) {
                await iterator.close();
                break;
            }
        }

        console.info(`--- Tìm thấy ${results.length} bản ghi hóa đơn bán hàng ---`);
        return results;
    }


    /**
     * Truy xuất một bản ghi thuốc duy nhất bằng ID log của nó.
     * Có thể gọi bởi ManufacturerMSP, PharmacyMSP, StorageAMSP và StorageBMSP.
     * @param {Context} ctx Ngữ ngữ cảnh giao dịch.
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

            if (!medicine.parentLogId) {
                break;
            }
            if (medicine.parentLogId === currentLogId) {
                console.warn(`Lỗi: parentLogId của ${currentLogId} trỏ về chính nó. Dừng truy vết để tránh vòng lặp vô hạn.`);
                break;
            }

            currentLogId = medicine.parentLogId;
        }

        return JSON.stringify(chain.reverse());
    }

    /**
     * Truy xuất tất cả các bản ghi thuốc và giao dịch xuất kho trên sổ cái.
     * Có thể gọi bởi ManufacturerMSP, PharmacyMSP, StorageAMSP và StorageBMSP.
     * Lưu ý: Đối với các sổ cái rất lớn, hãy cân nhắc sử dụng truy vấn nâng cao với CouchDB để tăng hiệu quả.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @returns {string} Mảng chuỗi JSON của tất cả các bản ghi thuốc và giao dịch xuất kho.
     */
    async getAllMedicines(ctx) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);
        const iterator = await ctx.stub.getStateByRange('', ''); 
        const allRecords = []; 

        let result = await iterator.next();
        while (!result.done) {
            const rawValue = result.value.value.toString('utf8');

            if (!rawValue) {
                console.warn(`Tìm thấy giá trị rỗng cho khóa ${result.value.key}`);
            } else {
                try {
                    const record = JSON.parse(rawValue);
                    // Chỉ thêm các bản ghi thuốc và giao dịch giao hàng (không phải PharmacyRequest)
                    if (((record.medicineId && record.batchId) || record.action == 'PharmacyDelivery') && typeof record.distributedQuantities === 'number') {
                        allRecords.push(record);
                    }
                } catch (err) {
                    console.error(`JSON không hợp lệ tại khóa ${result.value.key}:`, err.message);
                }
            }
            result = await iterator.next();
        }
        console.info(`Đã truy xuất ${allRecords.length} bản ghi thuốc và giao dịch xuất kho.`);
        return JSON.stringify(allRecords);
    }
    
    /**
     * Truy xuất tất cả các yêu cầu từ nhà thuốc (PharmacyRequest).
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @returns {string} Chuỗi JSON chứa mảng các yêu cầu nhà thuốc.
     */
    async getPharmacyRequests(ctx) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);

        const iterator = await ctx.stub.getStateByRange('', '');
        const pharmacyRequests = [];

        let result = await iterator.next();
        while (!result.done) {
            const rawValue = result.value.value.toString('utf8');
            if (rawValue) {
                try {
                    const record = JSON.parse(rawValue);
                    if (record.action === 'PharmacyRequest') {
                        pharmacyRequests.push(record);
                    }
                } catch (err) {
                    console.error(`Lỗi phân tích JSON khi tìm yêu cầu nhà thuốc: ${err.message}`);
                }
            }
            result = await iterator.next();
        }
        console.info(`Đã truy xuất ${pharmacyRequests.length} yêu cầu nhà thuốc.`);
        return JSON.stringify(pharmacyRequests);
    }


    /**
     * Traces the full history of a medicine batch from its creation to its current state.
     * Callable by ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP.
     * @param {Context} ctx Ngữ cảnh giao dịch.
     * @param {string} targetLogId The log ID of the medicine record to trace.
     * @returns {string} Chuỗi JSON chứa đường dẫn truy vết và dữ liệu đầy đủ của các bản ghi liên quan.
     */
    async traceMedicineByLogId(ctx, targetLogId) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);
        
        const allMedicines = JSON.parse(await this.getAllMedicines(ctx)); 

        let node = allMedicines.find(m => m.logId === targetLogId || m.txId === targetLogId); 
        if (!node) {
            throw new Error(`Không tìm thấy thuốc hoặc giao dịch với ID ${targetLogId} trong sổ cái.`);
        }

        const path = [node];
        let current = node;
        while (current.parentLogId) {
            const parent = allMedicines.find(m => m.logId === current.parentLogId);
            if (!parent) {
                console.warn(`Không tìm thấy parent logId ${current.parentLogId} cho ID ${current.logId || current.txId}. Đường dẫn truy vết có thể không đầy đủ.`);
                break; 
            }
            path.unshift(parent); 
            current = parent;
        }

        const formattedTracePath = path.map((logEntry, index) => {
            let fromEntity = 'Unknown';
            let toEntity = 'Unknown';
            let mainId = logEntry.logId || logEntry.txId; 
            let timestamp = logEntry.productionDate || logEntry.timestamp || new Date().toISOString(); 

            if (logEntry.action === 'CREATE') {
                fromEntity = 'Nguồn gốc (Nhà sản xuất)';
                toEntity = logEntry.manufacturerId; 
            } else if (logEntry.action === 'INBOUND') {
                fromEntity = logEntry.fromId || 'Người giữ trước đó'; 
                toEntity = logEntry.toId; 
                timestamp = logEntry.timestamp || new Date().toISOString(); 
            } else if (logEntry.action === 'PharmacyDelivery') { 
                fromEntity = logEntry.fromId;
                toEntity = logEntry.toId;
                timestamp = logEntry.timestamp || new Date().toISOString();
            } else if (logEntry.action === 'CONSUME') { 
                fromEntity = logEntry.locationId;
                toEntity = 'Người tiêu dùng cuối';
                timestamp = logEntry.timestamp || new Date().toISOString();
            }

            let quantityInvolved = 0;
            if (logEntry.action === 'CREATE' || logEntry.action === 'INBOUND' || logEntry.action === 'PharmacyDelivery') {
                quantityInvolved = logEntry.totalQuantity || logEntry.quantity || 0; 
            } else if (logEntry.action === 'CONSUME') { 
                   quantityInvolved = logEntry.consumedQuantity; 
            }
            
            const currentHoldings = (typeof logEntry.distributedQuantities === 'number') ? 
                                    `${logEntry.distributedQuantities} đơn vị còn lại.` : 'N/A';

            let outboundDetailsOutput = 'Không có thông tin xuất kho/tiêu thụ.';
            if (Array.isArray(logEntry.consumptionDetails) && logEntry.consumptionDetails.length > 0) {
                outboundDetailsOutput = logEntry.consumptionDetails.map(detail => {
                    if (detail.type === 'TRANSFER_OUT') {
                        return `Chuyển ${detail.quantity} đến ${detail.toId} lúc ${new Date(detail.timestamp).toLocaleString()}`;
                    } else if (detail.type === 'CONSUME') {
                        return `Tiêu thụ ${detail.quantity} (giá ${detail.price}) bởi ${detail.consumerId} tại ${detail.locationId} lúc ${new Date(detail.timestamp).toLocaleString()}`;
                    } else if (detail.type === 'DELIVER_OUT') { 
                        return `Giao ${detail.quantity} đến ${detail.toId} (Yêu cầu ${detail.relatedRequestId}) lúc ${new Date(detail.timestamp).toLocaleString()}`;
                    }
                    return JSON.stringify(detail); 
                }).join('; ');
            }


            return {
                action: logEntry.action,
                id: mainId, 
                medicineId: logEntry.medicineId,
                batchId: logEntry.batchId,
                from: fromEntity,
                to: toEntity,
                quantity: quantityInvolved,
                currentHoldings: currentHoldings, 
                outboundDetails: outboundDetailsOutput, 
                timestamp: timestamp
            };
        });

        console.info(`Đã hoàn thành truy vết cho ID: ${targetLogId}`);
        return JSON.stringify({
            tracePath: formattedTracePath,
            fullData: path 
        });
    }
}

module.exports = SupplyChainContract;
