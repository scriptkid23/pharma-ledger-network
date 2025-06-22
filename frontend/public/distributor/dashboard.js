import { ip } from '../ip.js';

// Simplified userData, only needs distributor and potentially pharmacy info for context
let userData = {
  1: [], // Manufacturers (Might need for displaying names in history)
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
let comfingRequest = []; // Request

// --- API Interaction Functions --- 

// Fetch distributor and pharmacy lists (and potentially manufacturers for names)
async function getData() {
  try {
    const nsx = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaSanXuat`).then(res => res.json());
    const npp = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaPhanPhoi`).then(res => res.json());
    const nt = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaThuoc`).then(res => res.json());
    
    userData[1] = nsx.map(item => ({ id: item.MA_NHASX, name: item.TEN_NHASX }));
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
                // TEN_BQ mô tả loại bảo quản, có thể dùng thay cho 'type' hoặc 'shape' cũ
                type: item.TEN_BQ, 
                shape: item.DON_VI, // DON_VI (đơn vị) có thể phù hợp hơn với 'shape' nếu bạn muốn
                content: item.HAM_LUONG, // Giả sử 'Ham_Luong' là hàm lượng thuốc
                // Sử dụng MIN_C và MAX_C để biểu thị phạm vi nhiệt độ
                temperature: `${item.NHIET_DO_MIN_C}°C - ${item.NHIET_DO_MAX_C}°C`, 
                // Sử dụng MIN_PERCENT và MAX_PERCENT để biểu thị phạm vi độ ẩm
                humidity: `${item.DO_AM_MIN_PERCENT}% - ${item.DO_AM_MAX_PERCENT}%`, 
                light: item.ANH_SANG_INFO,
                expiryMonths: item.HAN_SD // Thêm thông tin hạn sử dụng theo tháng
            }
          });
        })
  } catch(err) {
       console.error('Lỗi fetch thuốc:', err)
  }
}

async function getInventory() {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getInventory`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify()
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
async function getDistributorInventory(userId, token, port) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getMedicinesByStorage`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({distributorId: userId, token, port})
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy kho thuốc nhà phân phối');
        }
        distributorInventory = data || [];
        
    } catch (error) {
        console.error("Error fetching distributor inventory:", error);
        alert(`Lỗi khi tải kho thuốc: ${error.message}`);
        distributorInventory = [];
    }
}

// Fetch pharmacy requests for this distributor (Needs a specific API endpoint)
async function getPharmacyRequests(token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getPharmacyRequests`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({token, port: ip.storagea})
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
async function getTokenById(id, secret, port) {
  try {
      const response = await fetch(`http://${ip.host}:${port}/user/enroll`, {
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
async function getMedicineByLogId(logId, token, port) {
  if (medicineHistory[logId]) {
      return medicineHistory[logId]; // Return cached data if available
  }
  try {
      const response = await fetch(`http://${ip.host}:${ip.backend}/api/getMedicineByLogId`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ logId, token, port })
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
    await getInventory(); // Fetch/update inventory
    await getDistributorInventory(userId, token, ip.storagea); // Fetch/update inventory
    await getPharmacyRequests(token); // Fetch/update requests

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
        if (item.action == "INBOUND" && item.transferCompanyId == userId) {
            countDistributorInventory ++;
            const medicineInfo = medicineDatabase[item.medicineId] || { name: 'Không rõ' }; // Get medicine name
            const tr = document.createElement('tr');
            const qrCell = document.createElement("td");
            const qrCanvas = document.createElement('canvas');
            qrCell.appendChild(qrCanvas);

            tr.innerHTML = `
                <td>${item.medicineId}</td>
                <td>${medicineInfo.name}</td>
                <td>${item.distributedQuantities}</td>
                <td>${formatDate(item.expiryDate)}</td>
                <td>${item.toId || 'N/A'}</td> <!-- Display storage location -->
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

function loadPharmacyRequestsTable() {
    const requestsTableBody = document.getElementById('order-requests');
    requestsTableBody.innerHTML = ''; // Clear table

    if (pharmacyRequests.length === 0) {
        requestsTableBody.innerHTML = '<tr><td colspan="6">Không có yêu cầu nào từ nhà thuốc.</td></tr>';
        return;
    }
    console.log(pharmacyRequests);
    pharmacyRequests.forEach(req => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${req.requestId}</td>
            <td>${getPharmacyNameById(req.pharmacyId)} (${req.pharmacyId})</td>
            <td>${formatDate(req.timestamp)}</td>
            <td>
                ${
                req.status === 'PENDING' ?
                `<button class="button is-small is-success approve-request" data-request-id="${req.requestId}">Chi tiết</button>
                <button class="button is-small is-danger reject-request" data-request-id="${req.requestId}">Từ chối</button>`:
                `<button class="button is-small is-success approve-request" data-request-id="${req.requestId}">Chi tiết</button>`
                }
            </td>        
                ${req.status === 'PENDING' ? 'Chờ phê duyệt' :
                req.status === 'FULFILLED' ? 'Đã hoàn thành' :
                req.status === 'PARTIALLY_FULFILLED' ? 'Hoàn thành một phần' :
                req.status === 'UNFULFILLED' ? 'Chưa cấp phát được' :
                req.status === 'REJECTED' ? 'Đã từ chối' :
                req.status === 'PROCESSED_WITH_ISSUES' ? 'Đã xử lý (có vấn đề)' :
                'Không xác định' // Trạng thái mặc định nếu không khớp
                }
            </td>
        `;
        requestsTableBody.appendChild(tr);
    });

    // Add event listeners for the new buttons
    addRequestActionListeners();
}

function setupTabNavigation() {
  const tabLinks = document.querySelectorAll(".tab-link");
  const tabContents = document.querySelectorAll(".tab-content");

  tabLinks.forEach((link) => {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      const tabId = this.getAttribute("data-tab");

      tabLinks.forEach(l => l.classList.remove('is-active'));
      this.classList.add('is-active');
      document.querySelectorAll(".menu-list .tab-link").forEach(sl => {
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

  // Show default tab ('inbound-management')
  document.getElementById('inbound-management').classList.remove('is-hidden');
  document.querySelectorAll(`.tab-link[data-tab="inbound-management"]`).forEach(link => link.classList.add('is-active'));
}

function setupDistributorEventListeners(userId) {
    const receiveBtn = document.getElementById('receive-medicine-button');
    const dispatchBtn = document.getElementById('dispatch-medicine-button');

    if (receiveBtn) {
        receiveBtn.addEventListener('click', async () => {
            const logId = document.getElementById('receive-medicine-logid').value.trim();
            const storageId = document.getElementById('storage-select').value;

            if (!logId || !storageId) {
                alert('Vui lòng nhập Mã ghi nhận và chọn Kho.');
                return;
            }
            const token = await getTokenById("storagea", "storageapw", ip.storagea);
            medicineHistory[logId] = await getMedicineByLogId(logId, token, ip.storagea); // Fetch history for this log ID
            const latestMedicine = medicineHistory[logId][medicineHistory[logId].length - 1]; // Get the latest medicine info from history
            if (!latestMedicine) {
                alert("Không tìm thấy thông tin thuốc")
                return
            }
            // Call API to receive medicine
            try {
                
                const response = await fetch(`http://${ip.host}:${ip.backend}/api/transferMedicine`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parentLogId: logId, 
                        fromId: latestMedicine?.toId || latestMedicine.manufacturerId, 
                        toId: storageId,
                        transferCompanyId: userId,
                        quantity: latestMedicine?.totalQuantity || latestMedicine.quantity, // Use totalQuantity if available, else quantity
                        token,
                        port: ip.storagea
                    })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.error || 'Lỗi khi nhập kho'); }

                alert('Nhập kho thành công!');
                // Refresh inventory and potentially activity
                await loadDistributorData(userId, token);
                await loadManufacturerMedicines(token);
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

            if (!requestId) {
                alert('Vui lòng nhập Mã yêu cầu.');
                return;
            }

            try {
                const token = await getTokenById("storagea", "storageapw", ip.storagea);
                const response = await fetch(`http://${ip.host}:${ip.backend}/api/approvePharmacyRequest`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requestId: requestId,
                        approvedItemIndices: getSelectedItemIndexes(requestId),
                        token,
                        port: ip.storagea
                    })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.error || 'Lỗi khi xuất kho'); }

                alert('Xuất kho thành công!');
                await loadDistributorData(userId, token);
                document.getElementById('dispatch-medicine-form').reset();
            } catch (error) {
                console.error("Error dispatching medicine:", error);
                alert(`Lỗi khi xuất kho: ${error.message}`);
            }
        });
    }
}

function getSelectedItemIndexes(requestId) {
    const requestsTableBody = document.getElementById('order-requests-med');
    const selectedIndexes = [];

    const request = pharmacyRequests.find(r => r.requestId === requestId);
    if (!request) return [];

    const rows = requestsTableBody.querySelectorAll('tr');
    
    rows.forEach((row, index) => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        // Chỉ đếm những checkbox KHÔNG bị disabled (FULFILLED thì bị disabled rồi)
        if (checkbox && checkbox.checked && !checkbox.disabled) {
            selectedIndexes.push(index); // chính là vị trí trong mảng request.items
        }
    });

    return selectedIndexes;
}

async function addRequestActionListeners() {
    document.getElementById("requests-medicine-button").onclick = () => {
        const requestId = document.getElementById("dispatch-request-id").value.trim();
        if (!requestId) return alert("Vui lòng nhập mã yêu cầu.");

        const request = pharmacyRequests.find(req => req.requestId === requestId);
        const tbody = document.getElementById("order-requests-med");
        tbody.innerHTML = "";

        if (!request) {
            tbody.innerHTML = `<tr><td colspan="4" class="has-text-centered has-text-danger">Không tìm thấy yêu cầu.</td></tr>`;
            return;
        }

        request.items.forEach(med => {
            const medInfo = medicineDatabase[med.medicineId] || { name: 'Không rõ' };
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>${med.medicineId}</td>
                <td>${medInfo.name}</td>
                <td>${med.quantity}</td>
                <td>
                ${
                med.status === 'FULFILLED' 
                    ? `<input type="checkbox" checked disabled>`
                    : (med.status === 'PENDING' || med.status === 'PARTIALLY_FULFILLED') 
                        ? `<input type="checkbox" class="fulfill-checkbox" data-medicine-id="${med.medicineId}">`
                        : `<span style="color: red;">❌</span>`
                }
                </td>
            `;
            tbody.appendChild(tr);
        });
    };

    document.querySelectorAll('.approve-request').forEach(button => {
        button.onclick = async (event) => {
            const requestId = event.target.dataset.requestId;
            const request = pharmacyRequests.find(req => req.requestId === requestId);
            if (!request) {
                alert('Yêu cầu không tồn tại hoặc đã bị xóa.');
                return;
            }
            document.getElementById("dispatch-request-id").value = requestId;
        }
    })

    document.querySelectorAll('.reject-request').forEach(button => {
        button.onclick = async (event) => {
            const requestId = event.target.dataset.requestId;
            if (confirm(`Bạn có chắc chắn muốn từ chối yêu cầu ${requestId} này không?`)) {
                try {
                    const token = await getTokenById("storagea", "storageapw", ip.storagea);
                    const response = await fetch(`http://${ip.host}:${ip.backend}/api/rejectRequest`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requestId, token })
                    });
                    const data = await response.json();
                    if (!response.ok) { throw new Error(data.error || 'Lỗi khi từ chối yêu cầu'); }

                    alert('Yêu cầu đã được từ chối.');
                    await loadDistributorData(localStorage.getItem('userId'), token); // Reload data
                } catch (error) {
                    console.error("Error rejecting request:", error);
                    alert(`Lỗi khi từ chối yêu cầu: ${error.message}`);
                }
            }
        };
    });
}

// Hàm hiển thị thông báo tùy chỉnh (thay thế alert)
function showMessage(message, type = 'info') {
    const messageContainer = document.getElementById('message-container'); // Đảm bảo có div này trong HTML của bạn
    if (!messageContainer) {
        console.error("Không tìm thấy #message-container. Thông báo sẽ không được hiển thị.");
        alert(message); // Fallback to alert if container not found
        return;
    }

    // Xóa mọi thông báo cũ
    messageContainer.innerHTML = ''; 

    const messageBox = document.createElement('div');
    messageBox.className = `notification is-${type} is-light`; // Bulma classes for styling
    messageBox.style.padding = '1rem';
    messageBox.style.marginBottom = '1rem';
    messageBox.style.borderRadius = '8px';
    messageBox.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    messageBox.style.display = 'flex';
    messageBox.style.alignItems = 'center';

    let icon = '';
    if (type === 'info') icon = 'ℹ️';
    else if (type === 'success') icon = '✅';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'danger') icon = '❌';

    messageBox.innerHTML = `
        <span style="font-size: 1.5rem; margin-right: 10px;">${icon}</span>
        <div style="flex-grow: 1;">${message}</div>
        <button class="delete"></button>
    `;
    messageContainer.appendChild(messageBox);

    const deleteButton = messageBox.querySelector('.delete');
    deleteButton.addEventListener('click', () => {
        messageBox.remove();
    });

    // Tự động xóa sau vài giây
    setTimeout(() => {
        messageBox.remove();
    }, 5000); // 5 giây
}

// Hàm chính để thiết lập các trình lắng nghe sự kiện theo dõi
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
                showMessage('Vui lòng nhập mã ghi nhận (Log ID).', 'warning');
                return;
            }

            resultsDiv.classList.add('is-hidden');
            detailsBox.innerHTML = '<p class="has-text-centered has-text-info">Đang tải...</p>';
            historyList.innerHTML = '';
            showMessage('Đang truy xuất thông tin...', 'info');

            try {
                // Giả định getMedicineByLogId fetch dữ liệu từ backend đã được join với SQL
                const historyData = await getMedicineByLogId(logId);

                console.log("History Data:", historyData);

                if (!historyData || historyData.length === 0) {
                    detailsBox.innerHTML = '<p class="has-text-centered has-text-danger">Không tìm thấy thông tin cho mã ghi nhận này.</p>';
                    resultsDiv.classList.remove('is-hidden');
                    showMessage('Không tìm thấy thông tin cho mã ghi nhận này.', 'danger');
                    return;
                }

                // --- Hiển thị chi tiết bản ghi đầu tiên (CREATE) ---
                const firstRecord = historyData[0]; // Bản ghi đầu tiên luôn là CREATE
                
                // Fetch medicine details from SQL DB (T003, T001, etc.)

                const medicineDisplayInfo = medicineDatabase[firstRecord.medicineId] // Lấy bản ghi đầu tiên

                detailsBox.innerHTML = `
                    <div class="box has-background-info-light p-4 mb-4 has-text-weight-bold" style="border-radius: 10px; border-left: 5px solid #209cee;">
                        <p class="title is-5 has-text-info">Thông tin cơ bản về thuốc</p>
                        <p><strong>Mã thuốc:</strong> ${firstRecord.medicineId}</p>
                        <p><strong>Tên thuốc:</strong> ${medicineDisplayInfo.name}</p>
                        <p><strong>Hàm lượng:</strong> ${medicineDisplayInfo.content}</p>
                        <p><strong>Đơn vị:</strong> ${medicineDisplayInfo.shape}</p>
                        <p><strong>Nhà sản xuất:</strong> ${firstRecord.manufacturerId}</p> 
                        <p><strong>Ngày sản xuất:</strong> ${formatDate(firstRecord.productionDate)}</p>
                        <p><strong>Hạn sử dụng:</strong> ${medicineDisplayInfo.expiryMonths} {Tháng}</p>
                        <p><strong>Lô sản xuất:</strong> ${firstRecord.batchId}</p>
                        <p><strong>Số lượng ban đầu:</strong> ${firstRecord.totalQuantity}</p>
                        <p><strong>Mã ghi nhận (Log ID):</strong> ${firstRecord.logId}</p>
                        <p><strong>Điều kiện bảo quản:</strong> ${medicineDisplayInfo.type}</p>
                        <p><strong>Nhiệt độ:</strong> ${medicineDisplayInfo.temperature}</p>
                        <p><strong>Độ ẩm:</strong> ${medicineDisplayInfo.humidity}</p>
                        <p><strong>Ánh sáng:</strong> ${medicineDisplayInfo.light}</p>
                    </div>
                `;
                
                // --- Hiển thị lịch sử (Timeline) ---
                if (historyData.length > 0) { // Bao gồm cả bản ghi đầu tiên trong timeline
                    historyData.forEach((item, index) => {
                        const li = document.createElement('li');
                        let contentHtml = '';
                        let markerClass = '';
                        let boxClass = 'has-background-white-ter'; // Default light background

                        if (item.action === 'CREATE') {
                            markerClass = 'is-primary';
                            boxClass = 'has-background-primary-light';
                            contentHtml = `
                                <p class="is-size-6 has-text-weight-bold">Sản xuất và tạo lô mới</p>
                                <p><strong>Nhà sản xuất:</strong> ${item.manufacturerId}</p>
                                <p><strong>Số lượng sản xuất:</strong> ${item.totalQuantity} đơn vị</p>
                                <p class="is-size-7 has-text-grey">ID Log: ${item.logId}</p>
                            `;
                        } else if (item.action === 'INBOUND') {
                            markerClass = 'is-info';
                            boxClass = 'has-background-info-light';
                            contentHtml = `
                                <p class="is-size-6 has-text-weight-bold">Nhập kho</p>
                                <p><strong>Từ:</strong> ${item.fromId} ➡️ <strong>Đến:</strong> ${item.toId}</p>
                                <p><strong>Số lượng chuyển:</strong> ${item.totalQuantity} đơn vị</p>
                                <p><strong>Hiện có tại kho:</strong> ${item.distributedQuantities} đơn vị</p>
                                <p class="is-size-7 has-text-grey">Công ty chuyển giao: ${item.transferCompanyId || 'N/A'}</p>
                                <p class="is-size-7 has-text-grey">ID Log: ${item.logId}</p>
                            `;
                        } else if (item.action === 'PharmacyDelivery') {
                            markerClass = 'is-success';
                            boxClass = 'has-background-success-light';
                            contentHtml = `
                                <p class="is-size-6 has-text-weight-bold">Giao hàng đến nhà thuốc</p>
                                <p><strong>Từ:</strong> ${item.fromId} ➡️ <strong>Đến:</strong> ${item.toId}</p>
                                <p><strong>Số lượng giao:</strong> ${item.quantity} đơn vị</p>
                                <p><strong>Số lượng còn lại tại nhà thuốc:</strong> ${item.distributedQuantities} đơn vị</p>
                                <p class="is-size-7 has-text-grey">Yêu cầu liên quan: ${item.relatedRequest || 'N/A'}</p>
                                <p class="is-size-7 has-text-grey">ID Giao dịch: ${item.txId}</p>
                            `;
                            // Kiểm tra và hiển thị chi tiết tiêu thụ (CONSUME) nếu có
                            if (Array.isArray(item.consumptionDetails) && item.consumptionDetails.length > 0) {
                                item.consumptionDetails.forEach(detail => {
                                    if (detail.type === 'CONSUME') {
                                        contentHtml += `
                                            <div class="box has-background-danger-light p-3 mt-3" style="border-radius: 8px;">
                                                <p class="is-size-7 has-text-weight-bold has-text-danger">Đã tiêu thụ</p>
                                                <p class="is-size-7"><strong>Bởi:</strong> ${detail.consumerId} (${detail.locationId})</p>
                                                <p class="is-size-7"><strong>Số lượng:</strong> ${detail.quantity} đơn vị</p>
                                                <p class="is-size-7"><strong>Giá:</strong> ${detail.price} VNĐ</p>
                                                <p class="is-size-7 has-text-grey">Thời gian: ${formatDate(detail.timestamp)}</p>
                                            </div>
                                        `;
                                    }
                                });
                            }
                        } else {
                            // Xử lý các hành động khác nếu có
                            markerClass = 'is-grey';
                            boxClass = 'has-background-light';
                            contentHtml = `
                                <p class="is-size-6 has-text-weight-bold">Hành động: ${item.action}</p>
                                <pre>${JSON.stringify(item, null, 2)}</pre>
                            `;
                        }

                        li.innerHTML = `
                            <div class="timeline-item">
                                <div class="timeline-marker ${markerClass}"></div>
                                <div class="timeline-content">
                                    <p class="heading">${formatDate(item.timestamp || item.productionDate)}</p>
                                    <div class="box ${boxClass} p-3" style="border-radius: 10px; box-shadow: none;">
                                        ${contentHtml}
                                    </div>
                                </div>
                            </div>
                        `;
                        historyList.appendChild(li);
                    });
                } else {
                    historyList.innerHTML = '<li>Không có lịch sử phân phối nào được ghi nhận.</li>';
                }
                
                // Tạo QR Code cho Log ID
                // Đảm bảo thư viện QRCode.toCanvas đã được tải
                if (typeof QRCode !== 'undefined' && qrCanvas) {
                    qrCanvas.getContext('2d').clearRect(0, 0, qrCanvas.width, qrCanvas.height); // Xóa QR cũ
                    QRCode.toCanvas(qrCanvas, logId, { width: 150, margin: 2 }, function (error) {
                        if (error) console.error('QR Code generation error:', error);
                    });
                } else {
                    console.warn("Thư viện QRCode hoặc canvas không khả dụng.");
                }

                resultsDiv.classList.remove('is-hidden');
                showMessage('Đã tải lịch sử theo dõi thành công!', 'success');

            } catch (error) {
                console.error("❌ Lỗi khi theo dõi Log ID:", error);
                detailsBox.innerHTML = '<p class="has-text-centered has-text-danger">Đã xảy ra lỗi khi tải thông tin. Vui lòng thử lại.</p>';
                resultsDiv.classList.remove('is-hidden');
                showMessage(`Lỗi: ${error.message || 'Không thể theo dõi thuốc.'}`, 'danger');
            }
        });
    }
}


function loadManufacturersData() {
    const manufacturerData = document.getElementById('manufacturer-select');
    for (const manufacturer of userData[1]) {
        const option = document.createElement('option');
        option.value = manufacturer.id;
        option.textContent = manufacturer.name;
        manufacturerData.appendChild(option);
    }
}

function renderManufacturerMedicines(medicines) {
    const tbody = document.getElementById('manufacturer-produced-medicines');
    tbody.innerHTML = ''; // Clear bảng trước
    if (medicines == 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="has-text-centered has-text-grey">Vui lòng chọn nhà sản xuất.</td></tr>`;
        return;
    }

    if (!medicines || medicines.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="has-text-centered has-text-grey">Không có thuốc nào.</td></tr>`;
        return;
    }

    medicines.forEach(med => {
        const tr = document.createElement('tr');

        const medInfo = medicineDatabase[med.medicineId] || {};
        const remainingToDistribute = (med.totalQuantity || 0) - (med.distributedQuantities || 0);

        let actionCell = '';
        if (remainingToDistribute > 0) {
            actionCell = `<span class="tag is-success">Đã nhập kho thành công</span>`;
        } else {
            actionCell = `<button class="button is-small is-primary" onclick="handleImport('${med.medicineId}', '${med.logId}')">Nhập kho</button>`;
        }

        tr.innerHTML = `
            <td>${med.medicineId || ''}</td>
            <td>${medInfo.name || 'Không rõ'}</td>
            <td>${med.totalQuantity || 0}</td>
            <td>${formatDate(med.expiryDate)}</td>
            <td>${med.logId || ''}</td>
            <td>${actionCell}</td>
        `;

        tbody.appendChild(tr);
    });

}

window.handleImport = function(medicineId, logId) {
    if (confirm(`Bạn có chắc muốn nhập kho thuốc "${medicineId}" không?`)) {
        document.getElementById('receive-medicine-logid').value = logId;
    }
};

function loadManufacturerMedicines(token) {
    const manufacturerId = document.getElementById('manufacturer-select').value;
    if (!manufacturerId) {
        renderManufacturerMedicines(0);
        return;
    }
    fetch(`http://${ip.host}:${ip.backend}/api/getMedicinesByManufacturer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manufacturerId: manufacturerId, token, port: ip.storagea})
    })
    .then(res => res.json())
    .then(medicines => {
        console.log("Medicines by manufacturer:", medicines);
        renderManufacturerMedicines(medicines);
    })
    .catch(err => {
        console.error("Lỗi:", err.message);
        alert("Không thể lấy dữ liệu thuốc.");
    });
}
document.getElementById('manufacturer-select').addEventListener('change', async () => {
    const token = await getTokenById("storagea", "storageapw", ip.storagea);
    loadManufacturerMedicines(token);
});

// --- Main Initialization --- 

document.addEventListener("DOMContentLoaded", async () => {
  await getData(); // Fetch initial user data
  await getDataMedicine(); // Fetch initial medicine data

  const params = new URLSearchParams(window.location.search);
  const userRole = params.get("role");
  const userId = params.get("userId");
    const token = await getTokenById("storagea", "storageapw", ip.storagea);
  const user = getUserById(userRole, userId);
  if (!userId || userRole !== "2") {
    alert("Bạn không có quyền truy cập vào trang này.");
    window.location.href = "/index.html";
    return;
  }

  document.getElementById("user-name").textContent = user.name || "Nhà phân phối không xác định";
  document.getElementById("user-role").textContent = getRoleName(userRole);

  setupTabNavigation();
  setupTrackingEventListeners();
  setupDistributorEventListeners(userId);
  loadDashboardData();
  loadMedicinesData();
  loadManufacturersData();
  await loadDistributorData(userId, token);
});


