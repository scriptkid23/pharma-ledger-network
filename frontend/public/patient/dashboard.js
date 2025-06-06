
const ip = {
    "host": "10.10.2.122", // Consider making this configurable or relative
    "backend": "3001",
    "frontend": "8080",
    "fablo": "8801"
};

// Simplified userData, needs patient, doctor (for names), pharmacy (for names)
let userData = {
  // 1: [], // Manufacturers (Might need for displaying names in history)
  // 2: [], // Distributors (Might need for displaying names in history)
  3: [], // Pharmacies - Will be populated by getData (for creating orders)
  4: [], // Doctors - Will be populated by getData (for prescription details)
  5: [], // Patients - Will be populated by getData
};

// Keep general medicine info
const medicineDatabase = {}; 
let medicineHistory = {}; // Store fetched history {logId: [events]}
let patientPrescriptions = []; // Store prescriptions for this patient
let patientOrders = []; // Store orders placed by this patient

// --- API Interaction Functions --- 

// Fetch patient, doctor, and pharmacy lists (and potentially others for names in history)
async function getData() {
  try {
    // Fetch only necessary lists for patient role
    const bn = await fetch(`http://${ip.host}:${ip.backend}/api/getBenhNhan`).then(res => res.json()); // ASSUMED API for patients
    const bs = await fetch(`http://${ip.host}:${ip.backend}/api/getBacSi`).then(res => res.json()); // ASSUMED API for doctors
    const nt = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaThuoc`).then(res => res.json()); // ASSUMED API for pharmacies
    
    userData[5] = bn.map(item => ({ id: item.MA_BENH_NHAN, name: item.TEN_BENH_NHAN })); // ASSUMED patient structure
    userData[4] = bs.map(item => ({ id: item.MA_BAC_SI, name: item.TEN_BAC_SI })); // ASSUMED doctor structure
    userData[3] = nt.map(item => ({ id: item.MA_NHA_THUOC, name: item.TEN_NHA_THUOC })); // ASSUMED pharmacy structure

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

// Fetch prescriptions for this patient (Needs a specific API endpoint)
async function getPatientPrescriptions(patientId, token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getPrescriptionsByPatient`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ patientId, token })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy đơn thuốc');
        }
        patientPrescriptions = data.response || [];
    } catch (error) {
        console.error("Error fetching patient prescriptions:", error);
        alert(`Lỗi khi tải đơn thuốc: ${error.message}`);
        patientPrescriptions = [];
    }
}

// Fetch orders placed by this patient (Needs a specific API endpoint)
async function getPatientOrders(patientId, token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getOrdersByPatient`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ patientId, token })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy đơn hàng đã đặt');
        }
        patientOrders = data.response || [];
    } catch (error) {
        console.error("Error fetching patient orders:", error);
        alert(`Lỗi khi tải đơn hàng: ${error.message}`);
        patientOrders = [];
    }
}

// Get authentication token (assuming 'admin'/'adminpw' is for patient or a general admin)
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
  // Needs patient, doctor, pharmacy info
  if (userData[roleId]) {
    return userData[roleId].find((user) => user.id == userId);
  }
  return null;
}

function getDoctorNameById(doctorId) {
    const doctor = userData[4]?.find(d => d.id == doctorId);
    return doctor ? doctor.name : `Bác sĩ ${doctorId}`;
}

function getPharmacyNameById(pharmacyId) {
    const pharmacy = userData[3]?.find(p => p.id == pharmacyId);
    return pharmacy ? pharmacy.name : `Nhà thuốc ${pharmacyId}`;
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
  // Only needs to return Patient name
  if (roleId === "5") {
    return "Bệnh nhân";
  }
  return "Không xác định";
}

// --- UI Population Functions --- 

// Load general dashboard stats (kept for overview tab)
function loadDashboardData() {
  // Adjust stats for patient context
  const pendingPrescriptions = patientPrescriptions.filter(p => p.status === 'Chờ phê duyệt bởi bệnh nhân').length;
  const approvedPrescriptions = patientPrescriptions.filter(p => p.status === 'Đã phê duyệt bởi bệnh nhân').length;
  const processingOrders = patientOrders.filter(o => o.status === 'Đang xử lý' || o.status === 'Chờ xử lý').length;
  const completedOrders = patientOrders.filter(o => o.status === 'Đã xử lý' || o.status === 'Đã giao').length;

  document.getElementById("total-medicines").textContent = pendingPrescriptions; // Pending Prescriptions
  document.getElementById("total-batches").textContent = approvedPrescriptions; // Approved Prescriptions
  document.getElementById("total-orders").textContent = processingOrders; // Processing Orders
  document.getElementById("total-prescriptions").textContent = completedOrders; // Completed Orders

  // Load recent activity (filter for patient actions if possible)
  const activityList = document.getElementById("activity-list");
  activityList.innerHTML = "<li>Đang tải hoạt động...</li>"; // Placeholder
  // TODO: Fetch and display relevant activity for the patient
}

// REMOVED: loadMedicinesData() - Patient doesn't need the full list view

// Load data specific to the patient role
async function loadPatientData(userId, token) {
    await getPatientPrescriptions(userId, token); // Fetch/update prescriptions
    await getPatientOrders(userId, token); // Fetch/update orders
    loadPatientPrescriptionsTables(userId);
    loadPatientOrdersTable(userId);
    populatePharmacySelect(); // Populate pharmacy options for creating orders
}

function populatePharmacySelect() {
    const pharmacySelect = document.getElementById('order-pharmacy-select');
    if (pharmacySelect && userData[3]) {
        // Clear existing options except the default
        pharmacySelect.length = 1;
        userData[3].forEach(pharmacy => {
            const option = document.createElement('option');
            option.value = pharmacy.id;
            option.textContent = `${pharmacy.name} (${pharmacy.id})`;
            pharmacySelect.appendChild(option);
        });
    }
}

function loadPatientPrescriptionsTables(userId) {
    const pendingTableBody = document.getElementById('patient-pending-prescriptions');
    const approvedTableBody = document.getElementById('patient-approved-prescriptions');
    pendingTableBody.innerHTML = ''; // Clear tables
    approvedTableBody.innerHTML = '';

    const pending = patientPrescriptions.filter(p => p.status === 'Chờ phê duyệt bởi bệnh nhân');
    const approved = patientPrescriptions.filter(p => p.status === 'Đã phê duyệt bởi bệnh nhân');

    if (pending.length === 0) {
        pendingTableBody.innerHTML = '<tr><td colspan="5">Không có đơn thuốc nào chờ phê duyệt.</td></tr>';
    }
    if (approved.length === 0) {
        approvedTableBody.innerHTML = '<tr><td colspan="5">Không có đơn thuốc nào đã phê duyệt.</td></tr>';
    }

    pending.forEach(prescription => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${prescription.prescriptionId}</td>
            <td>${getDoctorNameById(prescription.doctorId)} (${prescription.doctorId})</td>
            <td>${formatDate(prescription.creationDate)}</td>
            <td><button class="button is-small is-info view-prescription-details" data-prescription-id="${prescription.prescriptionId}">Xem</button></td>
            <td>
                <button class="button is-small is-success approve-prescription" data-prescription-id="${prescription.prescriptionId}">Phê duyệt</button>
                <button class="button is-small is-danger reject-prescription" data-prescription-id="${prescription.prescriptionId}">Từ chối</button>
            </td>
        `;
        pendingTableBody.appendChild(tr);
    });

    approved.forEach(prescription => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${prescription.prescriptionId}</td>
            <td>${getDoctorNameById(prescription.doctorId)} (${prescription.doctorId})</td>
            <td>${formatDate(prescription.creationDate)}</td>
            <td><button class="button is-small is-info view-prescription-details" data-prescription-id="${prescription.prescriptionId}">Xem</button></td>
            <td>
                <button class="button is-small is-primary create-order-from-prescription" data-prescription-id="${prescription.prescriptionId}">Tạo đơn hàng</button>
            </td>
        `;
        approvedTableBody.appendChild(tr);
    });

    // Add event listeners for the new buttons
    addPrescriptionActionListeners(userId);
}

function loadPatientOrdersTable(userId) {
    const ordersTableBody = document.getElementById('patient-orders');
    ordersTableBody.innerHTML = ''; // Clear table

    if (patientOrders.length === 0) {
        ordersTableBody.innerHTML = '<tr><td colspan="5">Chưa đặt đơn hàng nào.</td></tr>';
        return;
    }

    patientOrders.forEach(order => {
        const tr = document.createElement('tr');
        // Determine status tag based on order status
        let statusTag = `<span class="tag is-info">${order.status}</span>`; // Default
        if (order.status === 'Đã xử lý' || order.status === 'Đã giao') {
            statusTag = `<span class="tag is-success">${order.status}</span>`;
        } else if (order.status === 'Đã hủy') {
             statusTag = `<span class="tag is-danger">${order.status}</span>`;
        } else if (order.status === 'Chờ xử lý') {
             statusTag = `<span class="tag is-warning">${order.status}</span>`;
        }

        tr.innerHTML = `
            <td>${order.orderId}</td>
            <td>${getPharmacyNameById(order.pharmacyId)} (${order.pharmacyId})</td>
            <td>${formatDate(order.orderDate)}</td>
            <td>${statusTag}</td>
            <td><button class="button is-small is-info view-order-details" data-order-id="${order.orderId}">Xem</button></td>
        `;
        ordersTableBody.appendChild(tr);
    });

    // Add event listeners for view order details
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
      // Sync sidebar active state
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

  // Show default tab ('patient')
  document.getElementById('patient').classList.remove('is-hidden');
  document.querySelectorAll('.tab-link[data-tab="patient"]').forEach(link => link.classList.add('is-active'));
}

function setupPatientEventListeners(userId, token) {
    // Add listeners for prescription actions (view, approve, reject, create order)
    addPrescriptionActionListeners(userId, token);
    // Add listeners for order actions (view)
    addOrderActionListeners(userId, token);
    // Add listeners for the create order modal
    setupCreateOrderModalListeners(userId, token);
}

function addPrescriptionActionListeners(userId, token) {
    const pendingTableBody = document.getElementById('patient-pending-prescriptions');
    const approvedTableBody = document.getElementById('patient-approved-prescriptions');
    const createOrderModal = document.getElementById('create-order-modal');
    const orderPrescriptionIdSpan = document.getElementById('order-prescription-id');
    const orderPrescriptionDetailsDiv = document.getElementById('order-prescription-details');

    const handleAction = async (event) => {
        const target = event.target;
        const prescriptionId = target.dataset.prescriptionId;

        if (!prescriptionId) return; // Clicked elsewhere

        if (target.classList.contains('view-prescription-details')) {
            const prescription = patientPrescriptions.find(p => p.prescriptionId === prescriptionId);
            if (prescription) {
                displayPrescriptionDetails(prescription);
            } else {
                alert('Không tìm thấy chi tiết đơn thuốc.');
            }
        } else if (target.classList.contains('approve-prescription')) {
            if (!confirm(`Bạn có chắc muốn phê duyệt đơn thuốc ${prescriptionId}?`)) return;
            await updatePrescriptionStatusByPatient(userId, token, prescriptionId, 'Đã phê duyệt bởi bệnh nhân');
        } else if (target.classList.contains('reject-prescription')) {
            if (!confirm(`Bạn có chắc muốn từ chối đơn thuốc ${prescriptionId}?`)) return;
            await updatePrescriptionStatusByPatient(userId, token, prescriptionId, 'Đã từ chối bởi bệnh nhân');
        } else if (target.classList.contains('create-order-from-prescription')) {
            const prescription = patientPrescriptions.find(p => p.prescriptionId === prescriptionId);
            if (prescription) {
                orderPrescriptionIdSpan.textContent = prescriptionId;
                orderPrescriptionIdSpan.dataset.prescriptionId = prescriptionId; // Store ID for confirmation
                // Display prescription items in modal body
                let detailsHtml = '<h5>Thuốc trong đơn:</h5><ul>';
                prescription.items.forEach(item => {
                    const medInfo = medicineDatabase[item.medicineId] || { name: 'Không rõ' };
                    detailsHtml += `<li>${item.medicineId} (${medInfo.name}) - Log ID: ${item.logId} - Liều lượng: ${item.dosage} - Thời gian: ${item.duration}</li>`;
                });
                detailsHtml += '</ul>';
                orderPrescriptionDetailsDiv.innerHTML = detailsHtml;
                createOrderModal.classList.add('is-active');
            } else {
                alert('Không tìm thấy đơn thuốc để tạo đơn hàng.');
            }
        }
    };

    if (pendingTableBody) pendingTableBody.addEventListener('click', handleAction);
    if (approvedTableBody) approvedTableBody.addEventListener('click', handleAction);
}

function addOrderActionListeners(userId, token) {
    const ordersTableBody = document.getElementById('patient-orders');
    
    ordersTableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const orderId = target.dataset.orderId;

        if (!orderId) return; // Clicked elsewhere

        if (target.classList.contains('view-order-details')) {
            const order = patientOrders.find(o => o.orderId === orderId);
            if (order) {
                displayOrderDetails(order);
            } else {
                alert('Không tìm thấy chi tiết đơn hàng.');
            }
        }
    });
}

function setupCreateOrderModalListeners(userId, token) {
    const modal = document.getElementById('create-order-modal');
    const closeButton = document.getElementById('close-create-order-modal');
    const cancelButton = document.getElementById('cancel-create-order-button');
    const confirmButton = document.getElementById('confirm-create-order-button');
    const pharmacySelect = document.getElementById('order-pharmacy-select');
    const prescriptionIdSpan = document.getElementById('order-prescription-id');

    const closeModal = () => modal.classList.remove('is-active');

    closeButton.addEventListener('click', closeModal);
    cancelButton.addEventListener('click', closeModal);

    confirmButton.addEventListener('click', async () => {
        const pharmacyId = pharmacySelect.value;
        const prescriptionId = prescriptionIdSpan.dataset.prescriptionId;

        if (!pharmacyId) {
            alert('Vui lòng chọn nhà thuốc.');
            return;
        }
        if (!prescriptionId) {
            alert('Lỗi: Không tìm thấy mã đơn thuốc.');
            return;
        }

        // Find the prescription to get items
        const prescription = patientPrescriptions.find(p => p.prescriptionId === prescriptionId);
        if (!prescription || !prescription.items) {
             alert('Lỗi: Không tìm thấy thông tin thuốc trong đơn.');
             return;
        }

        // Call API to create order
        try {
            const response = await fetch(`http://${ip.host}:${ip.backend}/api/createOrderFromPrescription`, { // ASSUMED API Endpoint
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    patientId: userId, 
                    pharmacyId, 
                    prescriptionId, 
                    items: prescription.items, // Send items for backend validation/processing
                    token 
                })
            });
            const data = await response.json();
            if (!response.ok) { throw new Error(data.error || 'Lỗi khi tạo đơn hàng'); }

            alert('Tạo đơn hàng thành công! Mã đơn hàng: ' + data.orderId); // Assuming API returns order ID
            closeModal();
            await loadPatientData(userId, token); // Refresh orders and potentially prescription status

        } catch (error) {
            console.error("Error creating order:", error);
            alert(`Lỗi khi tạo đơn hàng: ${error.message}`);
        }
    });
}

async function updatePrescriptionStatusByPatient(userId, token, prescriptionId, newStatus) {
     try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/updatePrescriptionStatusByPatient`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId: userId, prescriptionId, status: newStatus, token })
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.error || 'Lỗi khi cập nhật trạng thái đơn thuốc'); }

        alert(`Cập nhật trạng thái đơn thuốc ${prescriptionId} thành công!`);
        // Refresh prescription list
        await loadPatientData(userId, token);

    } catch (error) {
        console.error("Error updating prescription status:", error);
        alert(`Lỗi khi cập nhật trạng thái: ${error.message}`);
    }
}

// Function to display prescription details (e.g., in an alert or modal)
function displayPrescriptionDetails(prescription) {
    let detailsHtml = `<h4>Chi tiết đơn thuốc: ${prescription.prescriptionId}</h4>
                       <p><strong>Bác sĩ:</strong> ${getDoctorNameById(prescription.doctorId)} (${prescription.doctorId})</p>
                       <p><strong>Ngày tạo:</strong> ${formatDate(prescription.creationDate)}</p>
                       <p><strong>Trạng thái:</strong> ${prescription.status || 'N/A'}</p>
                       <h5>Thuốc trong đơn:</h5><ul>`;
    prescription.items.forEach(item => {
        const medInfo = medicineDatabase[item.medicineId] || { name: 'Không rõ' };
        detailsHtml += `<li>${item.medicineId} (${medInfo.name}) - Log ID: ${item.logId} - Liều lượng: ${item.dosage} - Thời gian: ${item.duration}</li>`;
    });
    detailsHtml += `</ul>`;
    alert(detailsHtml.replace(/<[^>]*>/g, '\n')); // Simple alert for now
}

// Function to display order details (e.g., in an alert or modal)
function displayOrderDetails(order) {
    let detailsHtml = `<h4>Chi tiết đơn hàng: ${order.orderId}</h4>
                       <p><strong>Nhà thuốc:</strong> ${getPharmacyNameById(order.pharmacyId)} (${order.pharmacyId})</p>
                       <p><strong>Ngày đặt:</strong> ${formatDate(order.orderDate)}</p>
                       <p><strong>Trạng thái:</strong> ${order.status || 'N/A'}</p>
                       <p><strong>Đơn thuốc gốc:</strong> ${order.prescriptionId || 'N/A'}</p>
                       <h5>Thuốc trong đơn:</h5><ul>`;
    order.items.forEach(item => {
        const medInfo = medicineDatabase[item.medicineId] || { name: 'Không rõ' };
        detailsHtml += `<li>${item.medicineId} (${medInfo.name}) - Log ID: ${item.logId} - Số lượng: ${item.quantity}</li>`;
    });
    detailsHtml += `</ul>`;
    alert(detailsHtml.replace(/<[^>]*>/g, '\n')); // Simple alert for now
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
            if (qrCanvas) qrCanvas.getContext('2d').clearRect(0, 0, qrCanvas.width, qrCanvas.height); // Clear previous QR

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
            if (qrCanvas) {
                QRCode.toCanvas(qrCanvas, logId, { width: 150, margin: 2 }, function (error) {
                    if (error) console.error('QR Code generation error:', error);
                });
            }

            resultsDiv.classList.remove('is-hidden');
        });
    }
}

// --- Main Initialization --- 

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const roleId = params.get("role");
  const userId = params.get("userId");

  if (roleId !== "5") { 
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
  await getData(); // Get patient, doctor, pharmacy lists
  await getDataMedicine(); // Get general medicine definitions
  
  const user = getUserById(roleId, userId);
  if (!user) {
    alert("Không tìm thấy thông tin bệnh nhân cho mã ID này.");
    window.location.href = "../index.html";
    return;
  }

  // Assume patient uses 'admin'/'adminpw' for now, adjust if needed
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
  await loadPatientData(userId, token); // Load prescriptions and orders
  loadDashboardData(); // Load overview stats (after patient data is loaded)
  // REMOVED: loadMedicinesData();

  // Setup event listeners
  setupPatientEventListeners(userId, token);
  setupTrackingEventListeners(); 

});

console.log("Patient Dashboard JS Loaded");

