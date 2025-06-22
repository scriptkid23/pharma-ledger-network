
import { ip } from '../ip.js';

// Simplified userData, needs patient, doctor (for names), pharmacy (for names)
let userData = {
  // 1: [], // Manufacturers (Might need for displaying names in history)
  // 2: [], // Distributors (Might need for displaying names in history)
  3: [], // Pharmacies - Will be populated by getData (for creating orders)
  5: [], // Patients - Will be populated by getData
};

// Keep general medicine info
const medicineDatabase = {}; 
let medicineHistory = {}; // Store fetched history {logId: [events]}
let patientOrders = []; // Store orders placed by this patient

// --- API Interaction Functions --- 

// Fetch patient, doctor, and pharmacy lists (and potentially others for names in history)
async function getData() {
  try {
    const nt = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaThuoc`).then(res => res.json());
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

// Fetch orders placed by this patient (Needs a specific API endpoint)
async function getPatientOrders(patientId, pharmacyId) {
    console.log(patientId, pharmacyId)
    try {
        const response = await fetch(`http://${ip.host}:${ip.backend}/api/getPatientPurchaseHistory`, { // ASSUMED API Endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ patientId, pharmacyId })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Lỗi khi lấy đơn hàng đã đặt');
        }
        patientOrders = data || [];
        console.log("Fetched patient orders:", data);
    } catch (error) {
        console.error("Error fetching patient orders:", error);
        alert(`Lỗi khi tải đơn hàng: ${error.message}`);
        patientOrders = [];
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

async function loadPharmacyOptions() {
  try {
    const pharmacies = userData[3] || [];
    console.log("Pharmacies loaded:", pharmacies);
    
    const select = document.getElementById('pharmacyFilter');

    pharmacies.forEach(pharmacy => {
      // Check trùng trước khi thêm (nếu cần)
      if (!Array.from(select.options).some(opt => opt.value === pharmacy.id)) {
        const option = document.createElement('option');
        option.value = pharmacy.id;
        option.textContent = pharmacy.name;
        select.appendChild(option);
      }
    });

  } catch (err) {
    console.error('❌ Lỗi khi fetch danh sách nhà thuốc:', err.message);
  }
}



// Load general dashboard stats (kept for overview tab)
function loadDashboardData() {
  // Adjust stats for patient context
  const processingOrders = patientOrders.filter(o => o.status === 'Đang xử lý' || o.status === 'Chờ xử lý').length;
  const completedOrders = patientOrders.filter(o => o.status === 'Đã xử lý' || o.status === 'Đã giao').length;

  document.getElementById("total-medicines").textContent = "N/A"; // Not applicable for patient
  document.getElementById("total-batches").textContent = "N/A"; // Not applicable for patient
  document.getElementById("total-orders").textContent = processingOrders; // Processing Orders
  document.getElementById("total-prescriptions").textContent = completedOrders; // Completed Orders

  // Load recent activity (filter for patient actions if possible)
  const activityList = document.getElementById("activity-list");
  activityList.innerHTML = "<li>Đang tải hoạt động...</li>"; // Placeholder
  // TODO: Fetch and display relevant activity for the patient
}

// REMOVED: loadMedicinesData() - Patient doesn't need the full list view

// Load data specific to the patient role
async function loadPatientData(userId) {
    const ordersTableBody = document.getElementById('patient-orders');
    ordersTableBody.innerHTML = ''; // Clear table
    const selectPharmacyFilter = document.getElementById('pharmacyFilter').value;
    console.log("Selected Pharmacy Filter:", selectPharmacyFilter);
    if (selectPharmacyFilter == '0') {
        ordersTableBody.inertHTML = '<tr><td colspan="5">Chọn nhà thuốc.</td></tr>';
        return;
    }
    await getPatientOrders(userId, selectPharmacyFilter); // Fetch/update orders
 
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
            <td>${order.invoiceId}</td>
            <td>${formatDate(order.timestamp)}</td>
            <td>Hoàn Thành</td>
            <td><button class="button is-small is-info view-order-details" data-order-id="${order.invoiceId}">Xem</button></td>
        `;
        ordersTableBody.appendChild(tr);
    });
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

function switchToTab(tabId) {
    // Ẩn tất cả nội dung tab
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('is-hidden');
    });

    // Gỡ active khỏi tất cả tab-link
    document.querySelectorAll('.tab-link').forEach(link => {
        link.classList.remove('is-active');
    });

    // Hiện tab mong muốn
    document.getElementById(tabId).classList.remove('is-hidden');

    // Kích hoạt tab-link tương ứng
    const targetLink = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
    if (targetLink) {
        targetLink.classList.add('is-active');
    }
}

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

document.addEventListener("click", (event) => {
  if (event.target.classList.contains("view-order-details")) {
    const orderId = event.target.dataset.orderId;
    console.log("🔍 Đang xem chi tiết đơn hàng:", orderId);

    if (!orderId) {
      alert("Không tìm thấy mã đơn hàng.");
      return;
    }

    try {
      handleViewOrderDetails(orderId);
    } catch (err) {
      console.error("❌ Lỗi khi xử lý đơn hàng:", err);
      alert("Có lỗi xảy ra khi xem chi tiết đơn hàng.");
    }
  }
});


function handleViewOrderDetails(txId) {
    console.log("🔍 Đang xem chi tiết đơn hàng:", txId);
    switchToTab("tracking-patient");
    const trackInput = document.getElementById('track-patient-input');
    trackInput.value = txId; // Set the input to the order ID
    const trackButton = document.getElementById('track-patient-input');
    if (trackButton) {
        trackButton.click(); // Trigger the tracking logic
    }
    console.log("🔍 Đã chuyển sang tab theo dõi và tìm kiếm đơn hàng")
}

document.getElementById('pharmacyFilter').addEventListener('change', () => {
    const params = new URLSearchParams(window.location.search);
  loadPatientData(params.get("userId"));
});

document.getElementById("track-patient-button").addEventListener("click", async () => {
  const input = document.getElementById("track-patient-input").value.trim();
  if (!input) {
    alert("Vui lòng nhập mã giao dịch.");
    return;
  }

  try {
    
    const result = patientOrders.find(order => order.invoiceId === input);
    console.log("🔍 Kết quả tìm kiếm:", result);
    if (!result || !result.invoiceId) {
      alert("Không tìm thấy hóa đơn.");
      return;
    }

    const invoice = result;

    // 📦 Render bảng chi tiết giao dịch
    const detailBox = document.getElementById("tracking-patient-details");
    detailBox.innerHTML = `
      <p><strong>Mã hóa đơn:</strong> ${invoice.invoiceId}</p>
      <p><strong>Người mua (SĐT):</strong> ${invoice.consumerId}</p>
      <p><strong>Địa điểm bán:</strong> ${invoice.locationId}</p>
      <p><strong>Thời gian:</strong> ${new Date(invoice.timestamp).toLocaleString()}</p>
      <p><strong>Tổng tiền:</strong> ${invoice.totalAmount} VNĐ</p>
      <p><strong>Trạng thái:</strong> ${invoice.status}</p>
      <h4 class="subtitle mt-3">Danh sách thuốc:</h4>
      <table class="table is-striped is-fullwidth">
        <thead><tr><th>Mã thuốc</th><th>Tên thuốc</th><th>Số lượng yêu cầu</th>SL yêu cầu<th>Đơn giá</th><th>Thành tiền</th></tr></thead>
        <tbody>
          ${invoice.items.map(item => `
            <tr>
              <td>${item.medicineId}</td>
              <td>${medicineDatabase[item.medicineId]?.name || "Không xác định"}</td>
              <td>${item.requestedQuantity}</td>
              <td>${item.pricePerUnit}</td>
              <td>${item.totalPrice}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    // 📦 Render lịch sử phân phối nếu có sourceLogIds
    const historyList = document.getElementById("tracking-patient-list");
    historyList.innerHTML = "";
    invoice.items.forEach(item => {
      if (item.sourceLogIds && item.sourceLogIds.length > 0) {
        item.sourceLogIds.forEach((itemMed) => {
          const li = document.createElement("li");
          li.innerHTML = `<strong>${item.medicineId}</strong> lấy từ lô hàng có log <code>${itemMed.logId} với ${itemMed.quantity} đơn vị thuốc</code>`;
          historyList.appendChild(li);
        });
      }
    });

    // Hiện vùng kết quả
    document.getElementById("tracking-patient-results").classList.remove("is-hidden");

  } catch (err) {
    console.error("Lỗi khi tra cứu:", err);
    alert("Có lỗi xảy ra khi tra cứu.");
  }
});


// --- Main Execution --- 
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const userRole = params.get("role");
  const userId = params.get("userId");

  if (!userId || userRole !== '5') { // Ensure it's a patient
    alert('Bạn không có quyền truy cập trang này. Vui lòng đăng nhập với vai trò Bệnh Nhân.');
    window.location.href = '../index.html';
    return;
  }

  document.getElementById('user-name').textContent = `Tên: ${userId}`;
  // Fetch initial data
  await getData(); // Fetch pharmacies for display
  await getDataMedicine(); // Fetch general medicine info
  await loadPatientData(userId); // Load patient-specific orders

  // Setup tab navigation
  setupTabNavigation();

  // Load dashboard stats (after patient data is loaded)
  loadDashboardData();
  loadPharmacyOptions();

  // Setup event listeners
  setupTrackingEventListeners(); 
});


