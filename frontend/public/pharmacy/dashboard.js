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
        pharmacyInventory = data || [];
        console.log("Pharmacy Inventory:", pharmacyInventory);
    } catch (error) {
        console.error("Error fetching pharmacy inventory:", error);
        alert(`Lỗi khi tải kho thuốc: ${error.message}`);
        pharmacyInventory = [];
    }
}

// Get authentication token (assuming 'admin'/'adminpw' is for pharmacy or a general admin)
async function getTokenById(id, secret) {
  try {
      const response = await fetch(`http://${ip.host}:${ip.pharmacy}/user/enroll`, {
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
      console.log(result.token);
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
    await getPharmacyInventory(userId, token); // Fetch/update inventory
    // await getPatientOrders(userId, token); // Fetch/update patient orders

    loadPharmacyInventoryTable(userId);
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
        tr.innerHTML = `
            <td>${item.medicineId}</td>
            <td>${medicineInfo?.name || "Không có"}</td>
            <td>${item.quantity}</td>
            <td>${2 || 'N/A'}</td>

            <!-- Input số điện thoại -->
            <td>
                <div class="control">
                <input
                    class="input is-small"
                    type="tel"
                    name="phone"
                    placeholder="SĐT"
                    pattern="[0-9]{10,11}"
                />
                </div>
            </td>

            <!-- Input số lượng mua -->
            <td>
                <div class="control">
                <input
                    class="input is-small"
                    type="number"
                    name="buyQuantity"
                    min="1"
                    max="${item.quantity}"
                    placeholder="SL"
                />
                </div>
            </td>

            <!-- Nút bán -->
            <td>
                <button
                class="button is-small is-primary btn-sell"
                data-medicine-id="${item.medicineId}"
                >
                Bán
                </button>
            </td>
        `;
        inventoryTableBody.appendChild(tr);
    });
}

async function handleSell(medicineId, userId, button) {
  const row = button.closest("tr");
  const phoneInput = row.querySelector("input[name='phone']");
  const quantityInput = row.querySelector("input[name='buyQuantity']");

  const phone = phoneInput.value.trim();
  const quantity = parseInt(quantityInput.value);

  if (!phone || !/^\d{10,11}$/.test(phone)) {
    alert("Nhập số điện thoại hợp lệ!");
    return;
  }

  if (!quantity || quantity <= 0) {
    alert("Nhập số lượng hợp lệ!");
    return;
  }

  // 🧠 Lấy giá cả từ ô thứ 4 (giả sử đúng thứ tự cột)
  const priceCell = row.children[3]; // 0: ID, 1: name, 2: quantity, 3: PRICE
  const rawPrice = priceCell.textContent.trim().replace(/[^\d]/g, ''); // Bỏ ký tự "đ" nếu có
  const price = parseInt(rawPrice);

  if (isNaN(price)) {
    alert("Không lấy được giá thuốc!");
    return;
  }

  console.log("🩺 Bán thuốc", medicineId, "📞 SĐT:", phone, "🔢 SL:", quantity, "💰 Giá:", price);

  const response = await fetch(`http://${ip.host}:${ip.backend}/api/consumeQuantity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      medicineId,
      locationId: userId, // giả sử đây là pharmacyId
      consumerId: phone,
      quantity,
      price,
      token: await getTokenById("pharmacy", "pharmacypw")
    })
  });

  if (response.ok) {
    alert("✅ Bán thuốc thành công!");
  } else {
    const err = await response.text();
    alert("❌ Giao dịch thất bại: " + err);
  }
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

                alert('Tạo yêu cầu nhập thuốc thành công! Mã yêu cầu: ' + data.response.requestId); // Assuming API returns request ID
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
  // Sau khi render xong bảng:
    document.querySelectorAll('.btn-sell').forEach(button => {
    button.addEventListener('click', () => {
        const medicineId = button.dataset.medicineId;
        handleSell(medicineId, userId, button);
    });
    });
});

console.log("Pharmacy Dashboard JS Loaded");

