'use strict';

const { Contract } = require('fabric-contract-api');
const crypto = require('crypto');

class SupplyChainContract extends Contract {
    /**
     * Helper function to enforce MSP-based access control.
     * Throws an error if the calling client's MSP is not in the allowed list.
     * @param {Context} ctx The transaction context.
     * @param {string[]} allowedMSPs An array of MSP IDs that are allowed to call the function.
     * @returns {string} The MSP ID of the calling client.
     */
    _requireMSP(ctx, allowedMSPs) {
        const mspId = ctx.clientIdentity.getMSPID();
        if (!allowedMSPs.includes(mspId)) {
            throw new Error(`Permission denied for MSP: ${mspId}. Only ${allowedMSPs.join(', ')} are allowed.`);
        }
        return mspId;
    }

    /**
     * Hashes a given string to create a short, unique ID.
     * @param {string} str The string to hash.
     * @returns {string} A 16-character hexadecimal hash.
     */
    _hashId(str) {
        return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
    }

    /**
     * Creates a new medicine batch record on the ledger.
     * Only callable by ManufacturerMSP.
     * @param {Context} ctx The transaction context.
     * @param {string} medicineId The ID of the medicine.
     * @param {string} batchId The batch ID of the medicine.
     * @param {string} manufacturerId The ID of the manufacturer.
     * @param {string} productionDate The production date (e.g., YYYY-MM-DD).
     * @param {string} expiryDate The expiry date (e.g., YYYY-MM-DD).
     * @param {number} quantity The total quantity produced in this batch.
     * @returns {string} JSON string of the created medicine record.
     */
    async createMedicine(ctx, medicineId, batchId, manufacturerId, productionDate, expiryDate, quantity) {
        // Enforce that only ManufacturerMSP can create medicine.
        this._requireMSP(ctx, ['ManufacturerMSP']);

        // Generate a unique log ID for this creation event.
        const rawLog = `CREATE_${medicineId}_${batchId}_${Date.now()}`;
        const logId = this._hashId(rawLog);

        // Convert quantity to a number and validate it.
        const numericQuantity = Number(quantity);
        if (isNaN(numericQuantity) || numericQuantity <= 0) {
            throw new Error('Quantity must be a positive number.');
        }

        // Create the medicine object representing the initial state.
        const medicine = {
            action: 'CREATE', // Action type
            logId, // Unique ID for this log entry
            medicineId,
            batchId,
            manufacturerId,
            productionDate,
            expiryDate,
            totalQuantity: numericQuantity,
            // Initially, all quantity is with the manufacturer.
            distributedQuantities: {},
            consumedQuantity: 0,
            consumptionDetails: {}, // Initialize consumption details for consistency
            parentLogId: null // No parent for the initial creation
        };

        // Put the state onto the ledger.
        await ctx.stub.putState(logId, Buffer.from(JSON.stringify(medicine)));
        console.info(`Medicine batch created: ${logId}`);
        return JSON.stringify(medicine);
    }

    /**
     * Transfers a quantity of medicine from one entity to another.
     * Callable by ManufacturerMSP, StorageAMSP, and StorageBMSP.
     * @param {Context} ctx The transaction context.
     * @param {string} parentLogId The log ID of the parent medicine record from which quantity is transferred.
     * @param {string} fromId The ID of the entity transferring the medicine.
     * @param {string} toId The ID of the entity receiving the medicine.
     * @param {string} transferCompanyId The ID of the company performing the transfer (e.g., shipping company).
     * @param {number} quantity The amount of medicine to transfer.
     * @returns {string} JSON string of the new medicine record representing the inbound transfer.
     */
    async transferQuantity(ctx, parentLogId, fromId, toId, transferCompanyId, quantity) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'StorageAMSP', 'StorageBMSP']);

        const medicineBytes = await ctx.stub.getState(parentLogId);
        if (!medicineBytes || medicineBytes.length === 0) {
            throw new Error(`Parent medicine with logId ${parentLogId} not found`);
        }

        const parent = JSON.parse(medicineBytes.toString());

        const amount = Number(quantity);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Quantity to transfer must be a positive number.');
        }

        if (!parent.distributedQuantities[fromId] || parent.distributedQuantities[fromId] < amount) {
            throw new Error(`Not enough quantity at ${fromId} for transfer.`);
        }

        // Trừ lượng hàng khỏi fromId
        parent.distributedQuantities[fromId] -= amount;

        // Cộng vào toId (nếu cần)
        if (!parent.distributedQuantities[toId]) {
            parent.distributedQuantities[toId] = 0;
        }
        parent.distributedQuantities[toId] += amount;

        await ctx.stub.putState(parentLogId, Buffer.from(JSON.stringify(parent)));

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
            timestamp: new Date().toISOString(),
            totalQuantity: amount,
            distributedQuantities: {},
            consumedQuantity: 0,
            consumptionDetails: {},
        };

        await ctx.stub.putState(newLogId, Buffer.from(JSON.stringify(newMedicine)));
        console.info(`Medicine transferred: ${parentLogId} -> ${newLogId}`);
        return JSON.stringify(newMedicine);
    }


    /**
     * Records the consumption of a quantity of medicine at a specific location.
     * Callable by PharmacyMSP, StorageAMSP, and StorageBMSP.
     * @param {Context} ctx The transaction context.
     * @param {string} logId The log ID of the medicine record being consumed.
     * @param {string} locationId The ID of the entity consuming/selling the medicine.
     * @param {string} consumerId The ID of the consumer (e.g., patient ID, hospital ID).
     * @param {number} quantity The amount of medicine consumed.
     * @param {number} price The price at which the medicine was consumed/sold.
     * @returns {string} JSON string of the updated medicine record.
     */
    async consumeQuantity(ctx, logId, locationId, consumerId, quantity, price) {
        this._requireMSP(ctx, ['PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);

        const medicineBytes = await ctx.stub.getState(logId);
        if (!medicineBytes || medicineBytes.length === 0) {
            throw new Error(`Medicine ${logId} not found`);
        }

        const medicine = JSON.parse(medicineBytes.toString());
        const amount = Number(quantity);
        const numericPrice = Number(price);

        if (isNaN(amount) || amount <= 0) {
            throw new Error('Quantity to consume must be a positive number.');
        }
        if (isNaN(numericPrice) || numericPrice < 0) {
            throw new Error('Price must be a non-negative number.');
        }

        if (!medicine.distributedQuantities[locationId] || medicine.distributedQuantities[locationId] < amount) {
            throw new Error(`Not enough medicine at ${locationId} to consume.`);
        }

        medicine.distributedQuantities[locationId] -= amount;
        medicine.consumedQuantity += amount;

        // Ensure consumptionDetails exists before accessing its properties.
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
        console.info(`Medicine consumed from ${logId} at ${locationId}`);
        return JSON.stringify(medicine);
    }

    /**
     * Retrieves a single medicine record by its log ID.
     * Callable by ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP.
     * @param {Context} ctx The transaction context.
     * @param {string} logId The unique log ID of the medicine record.
     * @returns {string} JSON string of the medicine record.
     */
    async getMedicineBylogId(ctx, logId) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);

        const chain = [];
        let currentLogId = logId;

        while (currentLogId) {
            const medicineBytes = await ctx.stub.getState(currentLogId);

            if (!medicineBytes || medicineBytes.length === 0) {
                throw new Error(`Medicine with logId ${currentLogId} not found`);
            }

            const medicine = JSON.parse(medicineBytes.toString());
            chain.push(medicine);

            // Dừng nếu không có parentLogId hoặc chính nó là gốc
            if (!medicine.parentLogId || medicine.parentLogId === currentLogId) {
                break;
            }

            currentLogId = medicine.parentLogId;
        }

        // Trả về từ gốc -> con
        return JSON.stringify(chain.reverse());
    }


    /**
     * Retrieves all medicine records on the ledger.
     * Callable by ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP.
     * Note: For very large ledgers, consider using rich queries with CouchDB for efficiency.
     * @param {Context} ctx The transaction context.
     * @returns {string} JSON string array of all medicine records.
     */
    async getAllMedicines(ctx) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);
        const iterator = await ctx.stub.getStateByRange('', ''); // Gets all keys in the ledger
        const allMedicines = [];

        let result = await iterator.next();
        while (!result.done) {
            const rawValue = result.value.value.toString('utf8');

            if (!rawValue) {
                console.warn(`Empty value found for key ${result.value.key}`);
            } else {
                try {
                    const medicine = JSON.parse(rawValue);
                    // Filter out non-medicine records if any other data types are on the ledger
                    // This assumes all records have medicineId and batchId if they are medicine.
                    if (medicine.medicineId && medicine.batchId) {
                        allMedicines.push(medicine);
                    }
                } catch (err) {
                    console.error(`Invalid JSON at key ${result.value.key}:`, err.message);
                }
            }
            result = await iterator.next();
        }
        console.info(`Retrieved ${allMedicines.length} medicine records.`);
        return JSON.stringify(allMedicines);
    }

    /**
     * Traces the full history of a medicine batch from its creation to its current state.
     * Callable by ManufacturerMSP, PharmacyMSP, StorageAMSP, StorageBMSP.
     * @param {Context} ctx The transaction context.
     * @param {string} targetLogId The log ID of the medicine record to trace.
     * @returns {string} JSON string containing the trace path and full data of related records.
     */
    async traceMedicineByLogId(ctx, targetLogId) {
        this._requireMSP(ctx, ['ManufacturerMSP', 'PharmacyMSP', 'StorageAMSP', 'StorageBMSP']);
        
        // Fetch all medicine records to build the trace path.
        // In a production environment, for very large ledgers, a more efficient
        // approach like a rich query or explicit linking in the data model
        // would be preferred over iterating through all states.
        const iterator = await ctx.stub.getStateByRange('', '');
        const allMedicines = [];
        let result = await iterator.next();
        while (!result.done) {
            const rawValue = result.value.value.toString('utf8');
            if (rawValue) {
                try {
                    const medicine = JSON.parse(rawValue);
                    if (medicine.medicineId && medicine.batchId) { // Ensure it's a medicine record
                        allMedicines.push(medicine);
                    }
                } catch (err) {
                    console.error(`Error parsing JSON during traceMedicineByLogId for key ${result.value.key}:`, err.message);
                }
            }
            result = await iterator.next();
        }

        // Find the starting node for the trace.
        let node = allMedicines.find(m => m.logId === targetLogId);
        if (!node) {
            throw new Error(`Medicine with logId ${targetLogId} not found in ledger.`);
        }

        // Build the trace path by following parentLogId links.
        const path = [node];
        let current = node;
        while (current.parentLogId) {
            const parent = allMedicines.find(m => m.logId === current.parentLogId);
            if (!parent) {
                console.warn(`Parent logId ${current.parentLogId} not found for logId ${current.logId}. Trace path may be incomplete.`);
                break; // Stop if parent not found to prevent infinite loop or error
            }
            path.unshift(parent); // Add parent to the beginning of the path
            current = parent;
        }

        // Format the trace path for easier understanding.
        const formattedTracePath = path.map((logEntry, index) => {
            let fromEntity = 'Unknown';
            let toEntity = 'Unknown';
            let timestamp = logEntry.productionDate || new Date(logEntry.timestamp).toISOString(); // Prefer productionDate, fallback to timestamp

            // Determine 'from' and 'to' based on action type
            if (logEntry.action === 'CREATE') {
                fromEntity = 'Origin (Manufacturer)';
                toEntity = logEntry.manufacturerId; // Initial holder
            } else if (logEntry.action === 'INBOUND') {
                fromEntity = logEntry.fromId || 'Previous Holder'; // Use the stored fromId
                toEntity = logEntry.toId || Object.keys(logEntry.distributedQuantities || {})[0]; // Use stored toId or the key in distributedQuantities
                timestamp = logEntry.timestamp || new Date().toISOString(); // Transfers typically have a timestamp, assuming not stored
            } else if (logEntry.action === 'CONSUME') { // Assuming you might add a 'CONSUME' action log later
                fromEntity = logEntry.locationId;
                toEntity = 'End Consumer';
                timestamp = logEntry.timestamp || new Date().toISOString();
            }

            // Get the quantity relevant to this specific log entry
            let quantityInvolved = logEntry.totalQuantity || 0; // Total quantity for create/transfer
            if (logEntry.consumedQuantity !== undefined && logEntry.consumedQuantity > 0 && logEntry.action !== 'CREATE' && logEntry.action !== 'INBOUND') {
                 // If it's a consumption log, the quantity involved is the consumed amount
                 quantityInvolved = logEntry.consumedQuantity;
            } else if (logEntry.action === 'INBOUND') {
                quantityInvolved = logEntry.totalQuantity; // For inbound, totalQuantity is the amount transferred
            }


            return {
                action: logEntry.action,
                logId: logEntry.logId,
                from: fromEntity,
                to: toEntity,
                quantity: quantityInvolved,
                timestamp: timestamp
            };
        });

        console.info(`Trace completed for logId: ${targetLogId}`);
        return JSON.stringify({
            tracePath: formattedTracePath,
            fullData: path // Provides the full raw data for each step in the trace
        });
    }
}

module.exports = SupplyChainContract;
