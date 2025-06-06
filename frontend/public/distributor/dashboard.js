
import { ip } from '../ip.js';

// Simplified userData, only needs distributor and potentially pharmacy info for context
let userData = {
  // 1: [], // Manufacturers (Might need for displaying names in history)
  2: [], // Distributors - Will be populated by getData
  3: [], // Pharmacies - Will be populated by getData (for requests)
  // Roles 4 (Doctor) and 5 (Patient) removed
};

// Keep general medicine info
const medicineDatabase = {}; 
let medicineHistory = {}; // Store fetched history {logId: [events]}
let distributorInventory = []; // Store distributor's specific inventory logs
let inventory = []; // Store inventory for the distributor
let pharmacyRequests = []; // Store requests from pharmacies

// --- API Interaction Functions --- 

// Fetch distributor and pharmacy lists (and potentially manufacturers for names)
async function getData() {
  try {
    // const nsx = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaSanXuat`).then(res => res.json());
    const npp = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaPhanPhoi`).then(res => res.json());
    const nt = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaThuoc`).then(res => res.json());
    
    // userData[1] = nsx.map(item => ({ id: item.MA_NHASX, name: item.TEN_NHASX }));
    userData[2] = npp.map(item => ({ id: item.MA_NHAPP, name: item.TEN_NHAPP }));
    userData[3] = nt.map(item => ({ id: item.MA_NHA_THUOC, name: item.TEN_NHA_THUOC }));

  } catch (error) {
    console.error("Error fetching user data:", error);
  }
}

// Fetch general medicine definitions
async function getDataMedicine() {
  try {
      await fetch(`http://${ip.host}:${ip.backend}/api/getThuoc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(res => res.json())
        .then(data => {
          data.forEach(item => {
            medicineDatabase[item.MA_THUOC] = {
              name: item.TEN_THUOC,
              type: item.LOAI_THUOC,
              shape: item.KIEU_THUOC,
              temperature: item.NHIET_DO,
              humidity: item.DO_AM,
              light: item.ANH_SANG
            };
          });
        })
  } catch(err) {
       console.error('Lỗi fetch thuốc:', err)
  }
}

async function getInventory(distributorId, token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getInventory`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ distributorId, token })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy kho thuốc nhà phân phối');
        }
        inventory = data || [];
    } catch (error) {
        console.error("Error fetching distributor inventory:", error);
        alert(`Lỗi khi tải kho thuốc: ${error.message}`);
        distributorInventory = [];
    }
}

// Fetch distributor's inventory (Needs a specific API endpoint)
async function getDistributorInventory(distributorId, token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getAllMedicineCreate`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ distributorId, token })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy kho thuốc nhà phân phối');
        }
        distributorInventory = data.response || [];
        
    } catch (error) {
        console.error("Error fetching distributor inventory:", error);
        alert(`Lỗi khi tải kho thuốc: ${error.message}`);
        distributorInventory = [];
    }
}

// Fetch pharmacy requests for this distributor (Needs a specific API endpoint)
async function getPharmacyRequests(distributorId, token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getPharmacyRequestsForDistributor`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ distributorId, token })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy yêu cầu từ nhà thuốc');
        }
        pharmacyRequests = data.response || [];
    } catch (error) {
        console.error("Error fetching pharmacy requests:", error);
        alert(`Lỗi khi tải yêu cầu từ nhà thuốc: ${error.message}`);
        pharmacyRequests = [];
    }
}

// Get authentication token (assuming 'admin'/'adminpw' is for distributor or a general admin)
async function getTokenById(id, secret) {
  try {
      const response = await fetch(`http://${ip.host}:${ip.fablo}/user/enroll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id, secret })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to get error details
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || 'Unknown error'}`);
      }
      const result = await response.json();
      return result.token;
  } catch (error) {
      console.error("Error getting token:", error);
      alert(`Không thể lấy token xác thực: ${error.message}. Vui lòng thử lại.`);
      return null;
  }
}

// Fetch detailed medicine history by Log ID (generic function, useful for tracking tab)
async function getMedicineByLogId(logId) {
  if (medicineHistory[logId]) {
      return medicineHistory[logId]; // Return cached data if available
  }
  try {
      const response = await fetch(`http://${ip.host}:${ip.backend}/api/getMedicineByLogId`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ logId })
      });
      const data = await response.json();
      if (!response.ok) {
          throw new Error(data.error || 'Lỗi khi lấy thông tin thuốc');
      }
      const history = data.response || [];
      medicineHistory[logId] = history; // Cache the result
      return history;
  } catch(error) {
      console.error('Error fetching medicine data by Log ID:', error);
      alert(`Lỗi khi tra cứu thuốc: ${error.message}`);
      return [];
  }
}

// --- Helper Functions --- 

function getUserById(roleId, userId) {
  // Needs distributor and pharmacy info
  if (userData[roleId]) {
    return userData[roleId].find((user) => user.id == userId);
  }
  return null;
}

function getPharmacyNameById(pharmacyId) {
    const pharmacy = userData[3]?.find(p => p.id === pharmacyId);
    return pharmacy ? pharmacy.name : `Nhà thuốc ${pharmacyId}`;
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) {
          return "Ngày không hợp lệ";
      }
      return date.toLocaleDateString("vi-VN");
  } catch (e) {
      return "Ngày không hợp lệ";
  }
}

function getRoleName(roleId) {
  // Only needs to return Distributor name
  if (roleId === "2") {
    return "Nhà phân phối";
  }
  return "Không xác định";
}

// --- UI Population Functions --- 

// Load general dashboard stats (kept for overview tab)
function loadDashboardData() {
  // Adjust stats for distributor context
  document.getElementById("total-medicines").textContent = Object.keys(medicineDatabase).length; // Total defined medicines
  document.getElementById("total-batches").textContent = distributorInventory.length; // Total batches in *this* distributor's inventory
  document.getElementById("total-orders").textContent = pharmacyRequests.length; // Total pending/processed requests from pharmacies
  document.getElementById("total-prescriptions").textContent = "N/A"; // Not relevant

  // Load recent activity (filter for distributor actions if possible)
  const activityList = document.getElementById("activity-list");
  activityList.innerHTML = "<li>Đang tải hoạt động...</li>"; // Placeholder
  // TODO: Fetch and display relevant activity for the distributor
}

// Load general medicine list (kept for medicines tab)
function loadMedicinesData() {
  const medicinesList = document.getElementById("medicines-list");
  medicinesList.innerHTML = ""; // Clear previous entries

  if (Object.keys(medicineDatabase).length === 0) {
      medicinesList.innerHTML = '<tr><td colspan="5">Không có dữ liệu thuốc.</td></tr>';
      return;
  }

  for (const medId in medicineDatabase) {
    const med = medicineDatabase[medId];
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>${medId}</td>
        <td>${med.name || 'N/A'}</td>
        <td>${med.type || 'N/A'}</td>
        <td>${med.shape || 'N/A'}</td>
        <td>Nhiệt độ: ${med.temperature || 'N/A'}°C, Độ ẩm: ${med.humidity || 'N/A'}%, Ánh sáng: ${med.light || 'N/A'}</td>
    `;
    medicinesList.appendChild(tr);
  }
}

// Load data specific to the distributor role
async function loadDistributorData(userId, token) {
    await getInventory(userId, token); // Fetch/update inventory
    await getDistributorInventory(userId, token); // Fetch/update inventory
    await getPharmacyRequests(userId, token); // Fetch/update requests

    loadDistributorInventoryTable(userId);
    loadPharmacyRequestsTable(userId);
    populateStorageSelect(); // Populate storage options if needed
    console.log(medicineHistory);
}

function populateStorageSelect() {
    const storageSelect = document.getElementById('storage-select');
    if (storageSelect) {
        // Clear existing options except the default
        storageSelect.length = 1;
        // Add options based on available warehouses for this distributor (if applicable)
        // Example: Hardcoded for now, replace with dynamic data if available
        const storages = inventory; 
        storages.forEach(storage => {
            const option = document.createElement('option');
            option.value = storage.MA_KHO;
            option.textContent = `${storage.TEN_KHO}, ${storage.DIA_CHI}, ${storage.LOAI_KHO}, Sức chứa: ${storage.SUC_CHUA}`;
            storageSelect.appendChild(option);
        });
    }
}

function loadDistributorInventoryTable(userId) {
    const inventoryTableBody = document.getElementById('distributor-inventory');
    inventoryTableBody.innerHTML = ''; // Clear table
    let countDistributorInventory = 0;
    distributorInventory.forEach(item => {
        if (item.action = "INBOUND" && item.transferCompanyId == userId) {
            countDistributorInventory ++;
            const medicineInfo = medicineDatabase[item.medicineId] || { name: 'Không rõ' }; // Get medicine name
            const tr = document.createElement('tr');
            const qrCell = document.createElement("td");
            const qrCanvas = document.createElement('canvas');
            qrCell.appendChild(qrCanvas);

            tr.innerHTML = `
                <td>${item.medicineId}</td>
                <td>${medicineInfo.name}</td>
                <td>${item.quantity}</td>
                <td>${formatDate(item.expiryDate)}</td>
                <td>${item.storageId || 'N/A'}</td> <!-- Display storage location -->
                <td>${item.logId}</td>
            `;
            tr.appendChild(qrCell);
            inventoryTableBody.appendChild(tr);

            // Generate QR Code
            QRCode.toCanvas(qrCanvas, item.logId, { width: 50, margin: 1 }, function (error) {
            if (error) console.error('QR Code generation error:', error);
            });
        }
    });
    if (countDistributorInventory === 0) {
        inventoryTableBody.innerHTML = '<tr><td colspan="7">Kho thuốc trống.</td></tr>';
        return;
    }
}

function loadPharmacyRequestsTable(userId) {
    const requestsTableBody = document.getElementById('order-requests');
    requestsTableBody.innerHTML = ''; // Clear table

    if (pharmacyRequests.length === 0) {
        requestsTableBody.innerHTML = '<tr><td colspan="6">Không có yêu cầu nào từ nhà thuốc.</td></tr>';
        return;
    }

    pharmacyRequests.forEach(req => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${req.requestId}</td>
            <td>${getPharmacyNameById(req.pharmacyId)} (${req.pharmacyId})</td>
            <td>${formatDate(req.requestDate)}</td>
            <td><span class="tag ${req.status === 'Chờ phê duyệt' ? 'is-warning' : (req.status === 'Đã phê duyệt' ? 'is-success' : 'is-danger')}">${req.status}</span></td>
            <td><button class="button is-small is-info view-request-details" data-request-id="${req.requestId}">Xem</button></td>
            <td>
                ${req.status === 'Chờ phê duyệt' ? 
                    `<button class="button is-small is-success approve-request" data-request-id="${req.requestId}">Duyệt</button>
                     <button class="button is-small is-danger reject-request" data-request-id="${req.requestId}">Từ chối</button>` : 
                    (req.status === 'Đã phê duyệt' ? 'Đã xử lý' : 'Đã từ chối')
                }
            </td>
        `;
        requestsTableBody.appendChild(tr);
    });

    // Add event listeners for the new buttons
    addRequestActionListeners(userId);
}

// --- Event Listener Setup --- 

function setupTabNavigation() {
  const tabLinks = document.querySelectorAll(".tab-link");
  const tabContents = document.querySelectorAll(".tab-content");

  tabLinks.forEach((link) => {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      const tabId = this.getAttribute("data-tab");

      tabLinks.forEach(l => l.classList.remove('is-active'));
      this.classList.add('is-active');
      document.querySelectorAll('.menu-list .tab-link').forEach(sl => {
          sl.classList.toggle('is-active', sl.getAttribute('data-tab') === tabId);
      });

      tabContents.forEach((content) => {
        content.classList.add("is-hidden");
      });

      const selectedTab = document.getElementById(tabId);
      if (selectedTab) {
        selectedTab.classList.remove("is-hidden");
      }
    });
  });

  // Show default tab ('distributor')
  document.getElementById('distributor').classList.remove('is-hidden');
  document.querySelectorAll('.tab-link[data-tab="distributor"]').forEach(link => link.classList.add('is-active'));
}

function setupDistributorEventListeners(userId, token) {
    const receiveBtn = document.getElementById('receive-medicine-button');
    const dispatchBtn = document.getElementById('dispatch-medicine-button');

    if (receiveBtn) {
        receiveBtn.addEventListener('click', async () => {
            const logId = document.getElementById('receive-medicine-logid').value.trim();
            const storageId = document.getElementById('storage-select').value;
            // const quantity = parseInt(document.getElementById('receive-medicine-quantity').value.trim(), 10); // Quantity might be implicit from logId

            if (!logId || !storageId) {
                alert('Vui lòng nhập Mã ghi nhận và chọn Kho.');
                return;
            }

            medicineHistory[logId] = await getMedicineByLogId(logId); // Fetch history for this log ID
            const latestMedicine = medicineHistory[logId][medicineHistory[logId].length - 1]; // Get the latest medicine info from history
            if (!latestMedicine) {
                alert("Không tìm thấy thông tin thuốc")
                return
            }
            // Call API to receive medicine
            try {
                //logId, fromId, toId, transferCompanyId, quantity.toString()
                const response = await fetch(`http://${ip.host}:${ip.backend}/api/Inbound`, { // ASSUMED API Endpoint
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        logId, 
                        fromId: latestMedicine?.toId || latestMedicine.manufacturerId, 
                        toId: storageId,
                        transferCompanyId: userId,
                        quantity: latestMedicine?.totalQuantity || latestMedicine.quantity, // Use totalQuantity if available, else quantity
                        token
                    })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.error || 'Lỗi khi nhập kho'); }

                alert('Nhập kho thành công!');
                // Refresh inventory and potentially activity
                await loadDistributorData(userId, token);
                document.getElementById('receive-medicine-form').reset();
            } catch (error) {
                console.error("Error receiving medicine:", error);
                alert(`Lỗi khi nhập kho: ${error.message}`);
            }
        });
    }

    if (dispatchBtn) {
        dispatchBtn.addEventListener('click', async () => {
            const requestId = document.getElementById('dispatch-request-id').value.trim();
            const logId = document.getElementById('dispatch-logid').value.trim();
            const quantity = parseInt(document.getElementById('dispatch-quantity').value.trim(), 10);

            if (!requestId || !logId || isNaN(quantity) || quantity <= 0) {
                alert('Vui lòng nhập Mã yêu cầu, Mã ghi nhận (Log ID) và Số lượng hợp lệ.');
                return;
            }

            // Find the request to get pharmacyId
            const request = pharmacyRequests.find(r => r.requestId === requestId && r.status === 'Đã phê duyệt');
            if (!request) {
                alert('Không tìm thấy yêu cầu hợp lệ hoặc yêu cầu chưa được duyệt.');
                return;
            }
            const pharmacyId = request.pharmacyId;

            // Call API to dispatch medicine
            try {
                const response = await fetch(`http://${ip.host}:${ip.backend}/api/distributorDispatchMedicine`, { // ASSUMED API Endpoint
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ distributorId: userId, pharmacyId, requestId, logId, quantity, token })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.error || 'Lỗi khi xuất kho'); }

                alert('Xuất kho thành công! Log ID mới: ' + data.newLogId); // Assuming API returns new log ID
                // Refresh inventory and requests
                await loadDistributorData(userId, token);
                document.getElementById('dispatch-medicine-form').reset();
            } catch (error) {
                console.error("Error dispatching medicine:", error);
                alert(`Lỗi khi xuất kho: ${error.message}`);
            }
        });
    }

    // Add listeners for request approval/rejection (delegated)
    addRequestActionListeners(userId, token); 
}

function addRequestActionListeners(userId, token) {
    const requestsTableBody = document.getElementById('order-requests');
    
    requestsTableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const requestId = target.dataset.requestId;

        if (!requestId) return; // Clicked elsewhere

        if (target.classList.contains('view-request-details')) {
            // Find request details
            const request = pharmacyRequests.find(r => r.requestId === requestId);
            if (request) {
                let detailsHtml = `<h4>Chi tiết yêu cầu: ${requestId}</h4>
                                   <p><strong>Nhà thuốc:</strong> ${getPharmacyNameById(request.pharmacyId)} (${request.pharmacyId})</p>
                                   <p><strong>Ngày yêu cầu:</strong> ${formatDate(request.requestDate)}</p>
                                   <p><strong>Trạng thái:</strong> ${request.status}</p>
                                   <h5>Thuốc yêu cầu:</h5><ul>`;
                request.items.forEach(item => {
                    const medInfo = medicineDatabase[item.medicineId] || { name: 'Không rõ' };
                    detailsHtml += `<li>${item.medicineId} (${medInfo.name}): ${item.quantity} đơn vị</li>`;
                });
                detailsHtml += `</ul>`;
                // Display details in a modal or dedicated area (implement modal logic if needed)
                alert(detailsHtml.replace(/<[^>]*>/g, '\n')); // Simple alert for now
            } else {
                alert('Không tìm thấy chi tiết yêu cầu.');
            }

        } else if (target.classList.contains('approve-request')) {
            if (!confirm(`Bạn có chắc muốn duyệt yêu cầu ${requestId}?`)) return;
            await updateRequestStatus(userId, token, requestId, 'Đã phê duyệt');

        } else if (target.classList.contains('reject-request')) {
             if (!confirm(`Bạn có chắc muốn từ chối yêu cầu ${requestId}?`)) return;
            await updateRequestStatus(userId, token, requestId, 'Đã từ chối');
        }
    });
}

async function updateRequestStatus(userId, token, requestId, newStatus) {
     try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/updatePharmacyRequestStatus`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ distributorId: userId, requestId, status: newStatus, token })
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.error || 'Lỗi khi cập nhật trạng thái yêu cầu'); }

        alert(`Cập nhật trạng thái yêu cầu ${requestId} thành công!`);
        // Refresh requests list
        await getPharmacyRequests(userId, token);
        loadPharmacyRequestsTable(userId);

    } catch (error) {
        console.error("Error updating request status:", error);
        alert(`Lỗi khi cập nhật trạng thái: ${error.message}`);
    }
}

// Setup event listeners for the generic tracking tab/modal
function setupTrackingEventListeners() {
    const trackButton = document.getElementById('track-logid-button');
    const trackInput = document.getElementById('track-logid-input');
    const resultsDiv = document.getElementById('tracking-results');
    const detailsBox = document.getElementById('tracking-medicine-details');
    const historyList = document.getElementById('tracking-history-list');
    const qrCanvas = document.getElementById('qr-code-canvas');

    if (trackButton) {
        trackButton.addEventListener('click', async () => {
            const logId = trackInput.value.trim();
            if (!logId) {
                alert('Vui lòng nhập mã ghi nhận (Log ID).');
                return;
            }

            resultsDiv.classList.add('is-hidden');
            detailsBox.innerHTML = '<p>Đang tải...</p>';
            historyList.innerHTML = '';
            qrCanvas.getContext('2d').clearRect(0, 0, qrCanvas.width, qrCanvas.height); // Clear previous QR

            const historyData = await getMedicineByLogId(logId);

            if (!historyData || historyData.length === 0) {
                detailsBox.innerHTML = '<p>Không tìm thấy thông tin cho mã ghi nhận này.</p>';
                resultsDiv.classList.remove('is-hidden');
                return;
            }

            // Display details of the first record (creation event)
            const firstRecord = historyData[0];
            const medInfo = medicineDatabase[firstRecord.medicineId] || { name: 'Không rõ' };
            detailsBox.innerHTML = `
                <p><strong>Mã thuốc:</strong> ${firstRecord.medicineId}</p>
                <p><strong>Tên thuốc:</strong> ${medInfo.name}</p>
                <!-- <p><strong>Nhà sản xuất:</strong> ${firstRecord.manufacturerId}</p> -->
                <p><strong>Ngày sản xuất:</strong> ${formatDate(firstRecord.productionDate)}</p>
                <p><strong>Hạn sử dụng:</strong> ${formatDate(firstRecord.expiryDate)}</p>
                <p><strong>Lô sản xuất:</strong> ${firstRecord.batchId}</p>
                <p><strong>Số lượng ban đầu:</strong> ${firstRecord.quantity}</p>
                <p><strong>Mã ghi nhận (Log ID):</strong> ${firstRecord.logId}</p>
            `;

            // Display history
            historyList.innerHTML = ''; // Clear previous
            historyData.forEach((item, index) => {
                const li = document.createElement('li');
                const markerClass = index === 0 ? 'is-primary' : 'is-info'; // Highlight creation
                li.innerHTML = `
                    <div class="timeline-item">
                        <div class="timeline-marker ${markerClass}"></div>
                        <div class="timeline-content">
                        <p class="heading">${formatDate(item.timestamp)} (${item.action || (index === 0 ? 'Tạo' : 'Chuyển')})</p>
                        <p>
                            ${index === 0 ? `<strong>NSX:</strong> ${item.manufacturerId}` : `<strong>Từ:</strong> ${item.fromId}`}
                            ${index !== 0 ? `<strong>Đến:</strong> ${item.toId}` : ''}
                        </p>
                        <p>Số lượng: ${item.totalQuantity || item.quantity}</p>
                        <p class="is-size-7">Mã Log: ${item.logId}</p> 
                        </div>
                    </div>
                `;
                historyList.appendChild(li);
            });
            
            // Generate QR Code for the Log ID
            QRCode.toCanvas(qrCanvas, logId, { width: 150, margin: 2 }, function (error) {
                if (error) console.error('QR Code generation error:', error);
            });

            resultsDiv.classList.remove('is-hidden');
        });
    }
}

// --- Main Initialization --- 

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const roleId = params.get("role");
  const userId = params.get("userId");

  if (roleId !== "2") { 
      alert("Lỗi: Vai trò không hợp lệ cho trang này.");
      window.location.href = "../index.html"; 
      return;
  }
  if (!userId) {
      alert("Lỗi: Không tìm thấy mã người dùng.");
      window.location.href = "../index.html";
      return;
  }

  // Fetch initial data
  await getData(); // Get distributor & pharmacy lists
  await getDataMedicine(); // Get general medicine definitions
  
  const user = getUserById(roleId, userId);
  if (!user) {
    alert("Không tìm thấy thông tin nhà phân phối cho mã ID này.");
    window.location.href = "../index.html";
    return;
  }

  // Assume distributor uses 'admin'/'adminpw' for now, adjust if needed
  const token = await getTokenById("admin", "adminpw"); 
  if (!token) {
      alert("Lỗi xác thực. Không thể tải dữ liệu.");
      return; // Stop initialization if token fails
  }

  // Set user info in the UI
  document.getElementById("user-name").textContent = user.name;
  
  // Setup UI elements
  setupTabNavigation(); // Setup clicks for tabs

  // Load initial data into tabs
  await loadDistributorData(userId, token); // Load inventory and requests
  loadDashboardData(); // Load overview stats (after distributor data is loaded)
  loadMedicinesData(); // Load general medicine list

  // Setup event listeners
  setupDistributorEventListeners(userId, token);
  setupTrackingEventListeners(); 

});

console.log("Distributor Dashboard JS Loaded");

