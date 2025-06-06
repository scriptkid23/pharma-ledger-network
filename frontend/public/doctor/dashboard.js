
const ip = {
    "host": "10.10.2.122", // Consider making this configurable or relative
    "backend": "3001",
    "frontend": "8080",
    "fablo": "8801"
};

// Simplified userData, needs doctor and patient lists
let userData = {
  // 1: [], // Manufacturers (Might need for displaying names in history)
  // 2: [], // Distributors (Might need for displaying names in history)
  // 3: [], // Pharmacies (Might need for displaying names in history)
  4: [], // Doctors - Will be populated by getData
  5: [], // Patients - Will be populated by getData
};

// Keep general medicine info
const medicineDatabase = {}; 
let medicineHistory = {}; // Store fetched history {logId: [events]}
let doctorPrescriptions = []; // Store prescriptions created by this doctor

// --- API Interaction Functions --- 

// Fetch doctor and patient lists (and potentially others for names in history)
async function getData() {
  try {
    // Fetch only necessary lists for doctor role
    const bs = await fetch(`http://${ip.host}:${ip.backend}/api/getBacSi`).then(res => res.json()); // ASSUMED API for doctors
    const bn = await fetch(`http://${ip.host}:${ip.backend}/api/getBenhNhan`).then(res => res.json()); // ASSUMED API for patients
    
    userData[4] = bs.map(item => ({ id: item.MA_BAC_SI, name: item.TEN_BAC_SI })); // ASSUMED doctor structure
    userData[5] = bn.map(item => ({ id: item.MA_BENH_NHAN, name: item.TEN_BENH_NHAN })); // ASSUMED patient structure

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

// Fetch prescriptions created by this doctor (Needs a specific API endpoint)
async function getDoctorPrescriptions(doctorId, token) {
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getPrescriptionsByDoctor`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ doctorId, token })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy đơn thuốc đã tạo');
        }
        doctorPrescriptions = data.response || [];
    } catch (error) {
        console.error("Error fetching doctor prescriptions:", error);
        alert(`Lỗi khi tải đơn thuốc: ${error.message}`);
        doctorPrescriptions = [];
    }
}

// Get authentication token (assuming 'admin'/'adminpw' is for doctor or a general admin)
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
  // Needs doctor and patient info
  if (userData[roleId]) {
    return userData[roleId].find((user) => user.id == userId);
  }
  return null;
}

function getPatientNameById(patientId) {
    const patient = userData[5]?.find(p => p.id == patientId); // Use == for potential type mismatch
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
  // Only needs to return Doctor name
  if (roleId === "4") {
    return "Bác sĩ";
  }
  return "Không xác định";
}

// --- UI Population Functions --- 

// Load general dashboard stats (kept for overview tab)
function loadDashboardData() {
  // Adjust stats for doctor context
  document.getElementById("total-medicines").textContent = Object.keys(medicineDatabase).length; // Total defined medicines
  document.getElementById("total-batches").textContent = userData[5]?.length || 0; // Total patients known
  document.getElementById("total-orders").textContent = "N/A"; // Orders not relevant to doctor
  document.getElementById("total-prescriptions").textContent = doctorPrescriptions.length; // Prescriptions created by this doctor

  // Load recent activity (filter for doctor actions if possible)
  const activityList = document.getElementById("activity-list");
  activityList.innerHTML = "<li>Đang tải hoạt động...</li>"; // Placeholder
  // TODO: Fetch and display relevant activity for the doctor
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

// Load data specific to the doctor role
async function loadDoctorData(userId, token) {
    await getDoctorPrescriptions(userId, token); // Fetch/update prescriptions
    loadDoctorPrescriptionsTable(userId);
    populatePatientSelect(); // Populate patient options for new prescriptions
}

function populatePatientSelect() {
    const patientSelect = document.getElementById('prescription-patient');
    if (patientSelect && userData[5]) {
        // Clear existing options except the default
        patientSelect.length = 1;
        userData[5].forEach(patient => {
            const option = document.createElement('option');
            option.value = patient.id;
            option.textContent = `${patient.name} (${patient.id})`;
            patientSelect.appendChild(option);
        });
    }
}

function loadDoctorPrescriptionsTable(userId) {
    const prescriptionsTableBody = document.getElementById('doctor-prescriptions');
    prescriptionsTableBody.innerHTML = ''; // Clear table

    if (doctorPrescriptions.length === 0) {
        prescriptionsTableBody.innerHTML = '<tr><td colspan="6">Chưa tạo đơn thuốc nào.</td></tr>';
        return;
    }

    doctorPrescriptions.forEach(prescription => {
        const tr = document.createElement('tr');
        // Determine status tag based on prescription status (assuming 'status' field exists)
        let statusTag = '<span class="tag is-info">Đã tạo</span>'; // Default
        if (prescription.status === 'Đã phê duyệt bởi bệnh nhân') {
            statusTag = '<span class="tag is-success">BN đã duyệt</span>';
        } else if (prescription.status === 'Đã hủy') {
             statusTag = '<span class="tag is-danger">Đã hủy</span>';
        }
        // Add more statuses as needed

        tr.innerHTML = `
            <td>${prescription.prescriptionId}</td>
            <td>${getPatientNameById(prescription.patientId)} (${prescription.patientId})</td>
            <td>${formatDate(prescription.creationDate)}</td>
            <td>${statusTag}</td>
            <td><button class="button is-small is-info view-prescription-details" data-prescription-id="${prescription.prescriptionId}">Xem</button></td>
            <td>
                ${prescription.status !== 'Đã hủy' ? 
                    `<button class="button is-small is-danger cancel-prescription" data-prescription-id="${prescription.prescriptionId}">Hủy</button>` : 
                    'Đã hủy'
                }
                 <!-- Add other actions like 'Approve' if doctor needs to approve -->
            </td>
        `;
        prescriptionsTableBody.appendChild(tr);
    });

    // Add event listeners for the new buttons
    addPrescriptionActionListeners(userId);
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

  // Show default tab ('doctor')
  document.getElementById('doctor').classList.remove('is-hidden');
  document.querySelectorAll('.tab-link[data-tab="doctor"]').forEach(link => link.classList.add('is-active'));
}

function setupDoctorEventListeners(userId, token) {
    const createPrescriptionBtn = document.getElementById('create-prescription-button');
    const addPrescriptionItemBtn = document.getElementById('add-prescription-item-button');
    const prescriptionItemsContainer = document.getElementById('prescription-items-container');

    if (addPrescriptionItemBtn) {
        addPrescriptionItemBtn.addEventListener('click', () => {
            const newItemHtml = `
                <div class="prescription-item field">
                    <div class="field has-addons">
                        <div class="control is-expanded">
                            <input class="input prescription-medicine-logid" type="text" placeholder="Nhập Log ID thuốc">
                        </div>
                        <div class="control is-expanded">
                            <input class="input prescription-dosage" type="text" placeholder="Liều lượng (vd: 1v x 2 lần/ngày)">
                        </div>
                        <div class="control is-expanded">
                            <input class="input prescription-duration" type="text" placeholder="Thời gian (vd: 7 ngày)">
                        </div>
                        <div class="control">
                            <button type="button" class="button is-danger remove-prescription-item">&times;</button>
                        </div>
                    </div>
                </div>`;
            prescriptionItemsContainer.insertAdjacentHTML('beforeend', newItemHtml);
        });
    }

    if (prescriptionItemsContainer) {
        prescriptionItemsContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-prescription-item')) {
                // Prevent removing the last item
                if (prescriptionItemsContainer.querySelectorAll('.prescription-item').length > 1) {
                    event.target.closest('.prescription-item').remove();
                }
            }
        });
    }

    if (createPrescriptionBtn) {
        createPrescriptionBtn.addEventListener('click', async () => {
            const patientId = document.getElementById('prescription-patient').value;
            const items = [];
            const itemElements = prescriptionItemsContainer.querySelectorAll('.prescription-item');
            let isValid = true;

            itemElements.forEach(itemEl => {
                const logIdInput = itemEl.querySelector('.prescription-medicine-logid');
                const dosageInput = itemEl.querySelector('.prescription-dosage');
                const durationInput = itemEl.querySelector('.prescription-duration');
                
                const logId = logIdInput.value.trim();
                const dosage = dosageInput.value.trim();
                const duration = durationInput.value.trim();

                // Basic validation
                if (!logId || !dosage || !duration) {
                    isValid = false;
                    if (!logId) logIdInput.classList.add('is-danger'); else logIdInput.classList.remove('is-danger');
                    if (!dosage) dosageInput.classList.add('is-danger'); else dosageInput.classList.remove('is-danger');
                    if (!duration) durationInput.classList.add('is-danger'); else durationInput.classList.remove('is-danger');
                } else {
                    logIdInput.classList.remove('is-danger');
                    dosageInput.classList.remove('is-danger');
                    durationInput.classList.remove('is-danger');
                    // Need medicineId associated with logId for the backend
                    // This requires an async lookup or assuming logId implies medicineId
                    // For now, just pass logId, dosage, duration. Backend needs to handle lookup.
                    items.push({ logId, dosage, duration }); 
                }
            });

            if (!patientId) {
                alert('Vui lòng chọn bệnh nhân.');
                isValid = false;
            }
            if (items.length === 0) {
                 alert('Vui lòng thêm ít nhất một loại thuốc vào đơn.');
                 isValid = false;
            }
            if (!isValid) {
                alert('Vui lòng kiểm tra lại thông tin đơn thuốc.');
                return;
            }

            // Call API to create prescription
            try {
                const response = await fetch(`http://${ip.host}:${ip.backend}/api/createPrescription`, { // ASSUMED API Endpoint
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ doctorId: userId, patientId, items, token })
                });
                const data = await response.json();
                if (!response.ok) { throw new Error(data.error || 'Lỗi khi tạo đơn thuốc'); }

                alert('Tạo đơn thuốc thành công! Mã đơn thuốc: ' + data.prescriptionId); // Assuming API returns prescription ID
                // Optionally clear form or refresh prescription list
                document.getElementById('create-prescription-form').reset();
                prescriptionItemsContainer.innerHTML = `<!-- Reset item container -->
                    <div class="prescription-item field">
                        <label class="label is-small">Thuốc</label>
                        <div class="field has-addons">
                            <div class="control is-expanded">
                                <input class="input prescription-medicine-logid" type="text" placeholder="Nhập Log ID thuốc">
                            </div>
                            <div class="control is-expanded">
                                <input class="input prescription-dosage" type="text" placeholder="Liều lượng (vd: 1v x 2 lần/ngày)">
                            </div>
                            <div class="control is-expanded">
                                <input class="input prescription-duration" type="text" placeholder="Thời gian (vd: 7 ngày)">
                            </div>
                            <div class="control">
                                <button type="button" class="button is-danger remove-prescription-item" disabled>&times;</button>
                            </div>
                        </div>
                    </div>`;
                await loadDoctorData(userId, token); // Refresh prescription list
            } catch (error) {
                console.error("Error creating prescription:", error);
                alert(`Lỗi khi tạo đơn thuốc: ${error.message}`);
            }
        });
    }

    // Add listeners for prescription actions (view, cancel)
    addPrescriptionActionListeners(userId, token);
}

function addPrescriptionActionListeners(userId, token) {
    const prescriptionsTableBody = document.getElementById('doctor-prescriptions');
    
    prescriptionsTableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const prescriptionId = target.dataset.prescriptionId;

        if (!prescriptionId) return; // Clicked elsewhere

        if (target.classList.contains('view-prescription-details')) {
            // Find prescription details
            const prescription = doctorPrescriptions.find(p => p.prescriptionId === prescriptionId);
            if (prescription) {
                let detailsHtml = `<h4>Chi tiết đơn thuốc: ${prescriptionId}</h4>
                                   <p><strong>Bệnh nhân:</strong> ${getPatientNameById(prescription.patientId)} (${prescription.patientId})</p>
                                   <p><strong>Ngày tạo:</strong> ${formatDate(prescription.creationDate)}</p>
                                   <p><strong>Trạng thái:</strong> ${prescription.status || 'Đã tạo'}</p>
                                   <h5>Thuốc trong đơn:</h5><ul>`;
                prescription.items.forEach(item => {
                    // Need to get medicine name, potentially from logId or medicineId if available
                    detailsHtml += `<li>Log ID: ${item.logId} - Liều lượng: ${item.dosage} - Thời gian: ${item.duration}</li>`;
                });
                detailsHtml += `</ul>`;
                // Display details in a modal or dedicated area
                alert(detailsHtml.replace(/<[^>]*>/g, '\n')); // Simple alert for now
            } else {
                alert('Không tìm thấy chi tiết đơn thuốc.');
            }

        } else if (target.classList.contains('cancel-prescription')) {
             if (!confirm(`Bạn có chắc muốn hủy đơn thuốc ${prescriptionId}?`)) return;
            await updatePrescriptionStatus(userId, token, prescriptionId, 'Đã hủy');
        }
        // Add other actions like 'approve' if needed
    });
}

async function updatePrescriptionStatus(userId, token, prescriptionId, newStatus) {
     try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/updatePrescriptionStatus`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doctorId: userId, prescriptionId, status: newStatus, token })
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.error || 'Lỗi khi cập nhật trạng thái đơn thuốc'); }

        alert(`Cập nhật trạng thái đơn thuốc ${prescriptionId} thành công!`);
        // Refresh prescription list
        await loadDoctorData(userId, token);

    } catch (error) {
        console.error("Error updating prescription status:", error);
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

  if (roleId !== "4") { 
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
  await getData(); // Get doctor and patient lists
  await getDataMedicine(); // Get general medicine definitions
  
  const user = getUserById(roleId, userId);
  if (!user) {
    alert("Không tìm thấy thông tin bác sĩ cho mã ID này.");
    window.location.href = "../index.html";
    return;
  }

  // Assume doctor uses 'admin'/'adminpw' for now, adjust if needed
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
  await loadDoctorData(userId, token); // Load prescriptions
  loadDashboardData(); // Load overview stats (after doctor data is loaded)
  loadMedicinesData(); // Load general medicine list

  // Setup event listeners
  setupDoctorEventListeners(userId, token);
  setupTrackingEventListeners(); 

});

console.log("Doctor Dashboard JS Loaded");

