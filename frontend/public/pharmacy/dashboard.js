import { ip } from '../ip.js';

// Simplified userData, needs pharmacy, distributor (for requests), and patient (for orders) info
let userData = {
  // 1: [], // Manufacturers (Might need for displaying names in history)
  2: [], // Distributors - Will be populated by getData (for requests)
  3: [], // Pharmacies - Will be populated by getData
  // 4: [], // Doctors (Might need for order approval context)
  5: [
    {id: "BN001", name: "Cấn Tất Dương"},
    {id: "BN002", name: "Ngô Việt Dũng"}
  ], // Patients - Will be populated by getData (for orders)
};

// Keep general medicine info
const medicineDatabase = {}; 
let medicineHistory = {}; // Store fetched history {logId: [events]}
let pharmacyInventory = []; // Store pharmacy's specific inventory logs
let patientOrders = []; // Store orders from patients for this pharmacy

// --- API Interaction Functions --- 

// Fetch pharmacy, distributor, and patient lists (and potentially others for names)
async function getData() {
  try {
    // const nsx = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaSanXuat`).then(res => res.json());
    const npp = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaPhanPhoi`).then(res => res.json());
    const nt = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaThuoc`).then(res => res.json());
    // const bn = await fetch(`http://${ip.host}:${ip.backend}/api/getBenhNhan`).then(res => res.json()); // ASSUMED API for patients
    
    // userData[1] = nsx.map(item => ({ id: item.MA_NHASX, name: item.TEN_NHASX }));
    userData[2] = npp.map(item => ({ id: item.MA_NHAPP, name: item.TEN_NHAPP }));
    userData[3] = nt.map(item => ({ id: item.MA_NHA_THUOC, name: item.TEN_NHA_THUOC }));
    // userData[5] = bn.map(item => ({ id: item.MA_BENH_NHAN, name: item.TEN_BENH_NHAN })); // ASSUMED patient structure

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

// Fetch pharmacy's inventory (Needs a specific API endpoint)
async function getPharmacyInventory(pharmacyId, token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getPharmacyInventory`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pharmacyId, token })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy kho thuốc nhà thuốc');
        }
        pharmacyInventory = data.response || [];
    } catch (error) {
        console.error("Error fetching pharmacy inventory:", error);
        alert(`Lỗi khi tải kho thuốc: ${error.message}`);
        pharmacyInventory = [];
    }
}

// Fetch patient orders for this pharmacy (Needs a specific API endpoint)
async function getPatientOrders(pharmacyId, token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getPatientOrdersForPharmacy`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pharmacyId, token })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy đơn hàng từ bệnh nhân');
        }
        patientOrders = data.response || [];
    } catch (error) {
        console.error("Error fetching patient orders:", error);
        alert(`Lỗi khi tải đơn hàng: ${error.message}`);
        patientOrders = [];
    }
}

// Get authentication token (assuming 'admin'/'adminpw' is for pharmacy or a general admin)
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
  // Needs pharmacy, distributor, and patient info
  if (userData[roleId]) {
    return userData[roleId].find((user) => user.id == userId);
  }
  return null;
}

function getDistributorNameById(distributorId) {
    const distributor = userData[2]?.find(d => d.id === distributorId);
    return distributor ? distributor.name : `Nhà phân phối ${distributorId}`;
}

function getPatientNameById(patientId) {
    const patient = userData[5]?.find(p => p.id === patientId);
    return patient ? patient.name : `Bệnh nhân ${patientId}`;
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
          return "Ngày không hợp lệ";
      }
      return date.toLocaleDateString("vi-VN");
  } catch (e) {
      return "Ngày không hợp lệ";
  }
}

function getRoleName(roleId) {
  // Only needs to return Pharmacy name
  if (roleId === "3") {
    return "Nhà thuốc";
  }
  return "Không xác định";
}

// --- UI Population Functions --- 

// Load general dashboard stats (kept for overview tab)
function loadDashboardData() {
  // Adjust stats for pharmacy context
  document.getElementById("total-medicines").textContent = Object.keys(medicineDatabase).length; // Total defined medicines
  document.getElementById("total-batches").textContent = pharmacyInventory.length; // Total batches in *this* pharmacy's inventory
  document.getElementById("total-orders").textContent = patientOrders.filter(o => o.status === 'Chờ xử lý').length; // Pending patient orders
  document.getElementById("total-prescriptions").textContent = "N/A"; // Or count pending requests to distributors

  // Load recent activity (filter for pharmacy actions if possible)
  const activityList = document.getElementById("activity-list");
  activityList.innerHTML = "<li>Đang tải hoạt động...</li>"; // Placeholder
  // TODO: Fetch and display relevant activity for the pharmacy
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

// Load data specific to the pharmacy role
async function loadPharmacyData(userId, token) {
    // await getPharmacyInventory(userId, token); // Fetch/update inventory
    // await getPatientOrders(userId, token); // Fetch/update patient orders

    loadPharmacyInventoryTable(userId);
    loadPatientOrdersTable(userId);
    populateDistributorSelect(); // Populate distributor options for requests
}

function populateDistributorSelect() {
    const distributorSelect = document.getElementById('request-distributor');
    if (distributorSelect && userData[2]) {
        // Clear existing options except the default
        distributorSelect.length = 1;
        userData[2].forEach(distributor => {
            const option = document.createElement('option');
            option.value = distributor.id;
            option.textContent = `${distributor.name} (${distributor.id})`;
            distributorSelect.appendChild(option);
        });
    }
}

function loadPharmacyInventoryTable(userId) {
    const inventoryTableBody = document.getElementById('pharmacy-inventory');
    inventoryTableBody.innerHTML = ''; // Clear table

    if (pharmacyInventory.length === 0) {
        inventoryTableBody.innerHTML = '<tr><td colspan="6">Kho thuốc trống.</td></tr>';
        return;
    }

    pharmacyInventory.forEach(item => {
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
            <td>${item.logId}</td>
        `;
        tr.appendChild(qrCell);
        inventoryTableBody.appendChild(tr);

        // Generate QR Code
        QRCode.toCanvas(qrCanvas, item.logId, { width: 50, margin: 1 }, function (error) {
          if (error) console.error('QR Code generation error:', error);
        });
    });
}

function loadPatientOrdersTable(userId) {
    const ordersTableBody = document.getElementById('pharmacy-orders');
    ordersTableBody.innerHTML = ''; // Clear table

    if (patientOrders.length === 0) {
        ordersTableBody.innerHTML = '<tr><td colspan="6">Không có đơn hàng nào từ bệnh nhân.</td></tr>';
        return;
    }

    patientOrders.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${order.orderId}</td>
            <td>${getPatientNameById(order.patientId)} (${order.patientId})</td>
            <td>${formatDate(order.orderDate)}</td>
            <td><span class="tag ${order.status === 'Chờ xử lý' ? 'is-warning' : (order.status === 'Đã xử lý' ? 'is-success' : 'is-danger')}">${order.status}</span></td>
            <td><button class="button is-small is-info view-order-details" data-order-id="${order.orderId}">Xem</button></td>
            <td>
                ${order.status === 'Chờ xử lý' ? 
                    `<button class="button is-small is-success process-order" data-order-id="${order.orderId}">Xử lý</button>
                     <button class="button is-small is-danger cancel-order" data-order-id="${order.orderId}">Hủy</button>` : 
                    (order.status === 'Đã xử lý' ? 'Đã hoàn thành' : 'Đã hủy')
                }
            </td>
        `;
        ordersTableBody.appendChild(tr);
    });

    // Add event listeners for the new buttons
    addOrderActionListeners(userId);
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

  // Show default tab ('pharmacy')
  document.getElementById('pharmacy').classList.remove('is-hidden');
  document.querySelectorAll('.tab-link[data-tab="pharmacy"]').forEach(link => link.classList.add('is-active'));
}

function setupPharmacyEventListeners(userId, token) {
    const createRequestBtn = document.getElementById('create-request-button');
    const addRequestItemBtn = document.getElementById('add-request-item-button');
    const requestItemsContainer = document.getElementById('request-items-container');

    if (addRequestItemBtn) {
        addRequestItemBtn.addEventListener('click', () => {
            const newItemHtml = `
                <div class="request-item field is-grouped">
                    <div class="control is-expanded">
                        <input class="input request-medicine-id" type="text" placeholder="Nhập mã thuốc cần nhập">
                    </div>
                    <div class="control">
                        <input class="input request-quantity" type="number" min="1" placeholder="Số lượng">
                    </div>
                    <div class="control">
                        <button type="button" class="button is-danger remove-request-item">&times;</button>
                    </div>
                </div>`;
            requestItemsContainer.insertAdjacentHTML('beforeend', newItemHtml);
        });
    }

    if (requestItemsContainer) {
        requestItemsContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-request-item')) {
                // Prevent removing the last item
                if (requestItemsContainer.querySelectorAll('.request-item').length > 1) {
                    event.target.closest('.request-item').remove();
                }
            }
        });
    }

    if (createRequestBtn) {
        createRequestBtn.addEventListener('click', async () => {
            const distributorId = document.getElementById('request-distributor').value;
            const items = [];
            const itemElements = requestItemsContainer.querySelectorAll('.request-item');
            let isValid = true;

            itemElements.forEach(itemEl => {
                const medicineInput = itemEl.querySelector('.request-medicine-id');
                const quantityInput = itemEl.querySelector('.request-quantity');
                const medicineId = medicineInput.value.trim();
                const quantity = parseInt(quantityInput.value.trim(), 10);

                if (!medicineId || isNaN(quantity) || quantity <= 0) {
                    isValid = false;
                    medicineInput.classList.add('is-danger');
                    quantityInput.classList.add('is-danger');
                } else {
                    medicineInput.classList.remove('is-danger');
                    quantityInput.classList.remove('is-danger');
                    items.push({ medicineId, quantity });
                }
            });

            if (!distributorId) {
                alert('Vui lòng chọn nhà phân phối.');
                isValid = false;
            }
            if (items.length === 0) {
                 alert('Vui lòng thêm ít nhất một loại thuốc vào yêu cầu.');
                 isValid = false;
            }
            if (!isValid) {
                alert('Vui lòng kiểm tra lại thông tin yêu cầu.');
                return;
            }
            console.log('Creating request with items:', items);
            // Call API to create request
            try {
                const response = await fetch(`http://${ip.host}:${ip.backend}/api/createPharmacyRequest`, { // ASSUMED API Endpoint
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pharmacyId: userId, distributorId, items, token })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.error || 'Lỗi khi tạo yêu cầu nhập thuốc'); }

                alert('Tạo yêu cầu nhập thuốc thành công! Mã yêu cầu: ' + data.requestId); // Assuming API returns request ID
                // Optionally clear form or refresh request list
                document.getElementById('create-request-form').reset();
                requestItemsContainer.innerHTML = `<!-- Reset item container -->
                    <div class="request-item field is-grouped">
                        <div class="control is-expanded">
                            <label class="label is-small">Mã thuốc</label>
                            <input class="input request-medicine-id" type="text" placeholder="Nhập mã thuốc cần nhập">
                        </div>
                        <div class="control">
                             <label class="label is-small">Số lượng</label>
                            <input class="input request-quantity" type="number" min="1" placeholder="Số lượng">
                        </div>
                        <div class="control">
                            <label class="label is-small">&nbsp;</label>
                            <button type="button" class="button is-danger remove-request-item" disabled>&times;</button>
                        </div>
                    </div>`;
                // await loadPharmacyData(userId, token); // Refresh might be needed
            } catch (error) {
                console.error("Error creating request:", error);
                alert(`Lỗi khi tạo yêu cầu: ${error.message}`);
            }
        });
    }

    // Add listeners for order processing/cancellation (delegated)
    addOrderActionListeners(userId, token);
}

function addOrderActionListeners(userId, token) {
    const ordersTableBody = document.getElementById('pharmacy-orders');
    
    ordersTableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const orderId = target.dataset.orderId;

        if (!orderId) return; // Clicked elsewhere

        if (target.classList.contains('view-order-details')) {
            // Find order details
            const order = patientOrders.find(o => o.orderId === orderId);
            if (order) {
                let detailsHtml = `<h4>Chi tiết đơn hàng: ${orderId}</h4>
                                   <p><strong>Bệnh nhân:</strong> ${getPatientNameById(order.patientId)} (${order.patientId})</p>
                                   <p><strong>Ngày đặt:</strong> ${formatDate(order.orderDate)}</p>
                                   <p><strong>Trạng thái:</strong> ${order.status}</p>
                                   <p><strong>Mã đơn thuốc:</strong> ${order.prescriptionId || 'N/A'}</p>
                                   <h5>Thuốc trong đơn:</h5><ul>`;
                order.items.forEach(item => {
                    const medInfo = medicineDatabase[item.medicineId] || { name: 'Không rõ' };
                    detailsHtml += `<li>${item.medicineId} (${medInfo.name}) - Log ID: ${item.logId} - Số lượng: ${item.quantity}</li>`;
                });
                detailsHtml += `</ul>`;
                // Display details in a modal or dedicated area
                alert(detailsHtml.replace(/<[^>]*>/g, '\n')); // Simple alert for now
            } else {
                alert('Không tìm thấy chi tiết đơn hàng.');
            }

        } else if (target.classList.contains('process-order')) {
            if (!confirm(`Bạn có chắc muốn xử lý đơn hàng ${orderId}? Thao tác này sẽ trừ thuốc khỏi kho.`)) return;
            await updateOrderStatus(userId, token, orderId, 'Đã xử lý');

        } else if (target.classList.contains('cancel-order')) {
             if (!confirm(`Bạn có chắc muốn hủy đơn hàng ${orderId}?`)) return;
            await updateOrderStatus(userId, token, orderId, 'Đã hủy');
        }
    });
}

async function updateOrderStatus(userId, token, orderId, newStatus) {
     try {
        // Find the order to get details needed for the API call (like items)
        const order = patientOrders.find(o => o.orderId === orderId);
        if (!order) {
            throw new Error('Không tìm thấy đơn hàng.');
        }

        const response = await fetch(`http://${ip.host}:${ip.backend}/api/updatePatientOrderStatus`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send necessary info, might include items if processing deducts inventory
            body: JSON.stringify({ pharmacyId: userId, orderId, status: newStatus, items: order.items, token })
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.error || 'Lỗi khi cập nhật trạng thái đơn hàng'); }

        alert(`Cập nhật trạng thái đơn hàng ${orderId} thành công!`);
        // Refresh orders list and potentially inventory
        await loadPharmacyData(userId, token);

    } catch (error) {
        console.error("Error updating order status:", error);
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

  if (roleId !== "3") { 
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
  await getData(); // Get pharmacy, distributor, patient lists
  await getDataMedicine(); // Get general medicine definitions
  
  const user = getUserById(roleId, userId);
  if (!user) {
    alert("Không tìm thấy thông tin nhà thuốc cho mã ID này.");
    window.location.href = "../index.html";
    return;
  }

  // Assume pharmacy uses 'admin'/'adminpw' for now, adjust if needed
  const token = await getTokenById("pharmacy", "pharmacypw"); 
  if (!token) {
      alert("Lỗi xác thực. Không thể tải dữ liệu.");
      return; // Stop initialization if token fails
  }

  // Set user info in the UI
  document.getElementById("user-name").textContent = user.name;
  
  // Setup UI elements
  setupTabNavigation(); // Setup clicks for tabs

  // Load initial data into tabs
  await loadPharmacyData(userId, token); // Load inventory and orders
  loadDashboardData(); // Load overview stats (after pharmacy data is loaded)
  loadMedicinesData(); // Load general medicine list

  // Setup event listeners
  setupPharmacyEventListeners(userId, token);
  setupTrackingEventListeners(); 

});

console.log("Pharmacy Dashboard JS Loaded");

