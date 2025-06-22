import { ip } from '../ip.js';

// Simplified userData, only needs manufacturer info for context if necessary
let userData = {
  1: [], // Manufacturers - Will be populated by getData
  // Other roles removed as they are not needed for manufacturer logic
};

// Keep general medicine info
const medicineDatabase = {}; 
let medicineCraete = []; // Stores created medicine logs

// --- API Interaction Functions --- 

// Fetch manufacturer list (and potentially others if needed for context, but keep minimal)
async function getData() {
  try {
    const nsx = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaSanXuat`).then(res => res.json());
    userData[1] = nsx.map(item => ({
      id: item.MA_NHASX,
      name: item.TEN_NHASX
    }));
    // Removed fetching for NPP, NT as they are not directly used by manufacturer dashboard
  } catch (error) {
    console.error("Error fetching manufacturer data:", error);
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

// Fetch logs of medicines created (likely by any manufacturer, might need filtering later)
async function getDataMedicineCreate(userId, token) {
  try {
      await fetch(`http://${ip.host}:${ip.backend}/api/getMedicinesByManufacturer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ manufacturerId: userId, token, port: ip.fablo}) // Assuming '1' is the ID for the manufacturer role
      })
        .then(res => res.json())
        .then(data => {
          medicineCraete = data || []; // Ensure it's an array
        })
  } catch(err) {
       console.error('Lỗi fetch lịch sử tạo thuốc:', err);
       medicineCraete = []; // Default to empty array on error
  }
}

// Get authentication token (assuming 'admin'/'adminpw' is for manufacturer or a general admin)
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.token;
  } catch (error) {
      console.error("Error getting token:", error);
      alert("Không thể lấy token xác thực. Vui lòng thử lại.");
      return null;
  }
}

// Fetch detailed medicine history by Log ID (generic function, useful for tracking tab)
async function getMedicineByLogId(logId) {
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
      return data.response || []; // Ensure it's an array
  } catch(error) {
      console.error('Error fetching medicine data by Log ID:', error);
      alert(`Lỗi khi tra cứu thuốc: ${error.message}`);
      return [];
  }
}

// --- Helper Functions --- 

function getUserById(roleId, userId) {
  // Only needs to find manufacturer
  if (roleId === "1" && userData[1]) {
    return userData[1].find((user) => user.id == userId);
  }
  return null;
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
      const date = new Date(dateString);
      return date.toLocaleDateString("vi-VN");
  } catch (e) {
      return "Ngày không hợp lệ";
  }
}

function getRoleName(roleId) {
  // Only needs to return Manufacturer name
  if (roleId === "1") {
    return "Nhà sản xuất";
  }
  return "Không xác định";
}

// --- UI Population Functions --- 

// Load general dashboard stats (kept for overview tab)
function loadDashboardData() {
  // This might need adjustment if data sources change
  // Example: Count medicines created by *this* manufacturer if API supports it
  document.getElementById("total-medicines").textContent = Object.keys(medicineDatabase).length; // Example: total defined medicines
  document.getElementById("total-batches").textContent = medicineCraete.length; // Example: total created logs
  // Orders and Prescriptions might not be relevant here, set to 0 or hide
  document.getElementById("total-orders").textContent = "N/A"; 
  document.getElementById("total-prescriptions").textContent = "N/A";

  // Load recent activity (filter for manufacturer actions if possible)
  const activityList = document.getElementById("activity-list");
  activityList.innerHTML = "<li>Đang tải hoạt động...</li>"; // Placeholder
  // TODO: Fetch and display relevant activity for the manufacturer
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

// Load data specific to the manufacturer role
function loadManufacturerData(userId) {
  const manufacturerMedicines = document.getElementById("manufacturer-medicines");
  manufacturerMedicines.innerHTML = ""; // Clear previous entries

  // Filter created medicines for the current manufacturer
  const user = getUserById("1", userId);
  const manufacturerId = user ? user.id : null;

  const filteredMedicines = medicineCraete.filter(med => med.manufacturerId === manufacturerId);

  if (filteredMedicines.length === 0) {
    manufacturerMedicines.innerHTML = '<tr><td colspan="8">Chưa có thuốc nào được sản xuất.</td></tr>';
    return;
  }

  filteredMedicines.forEach((med) => {
    console.log(med);
    if (med.action == "CREATE" && med.manufacturerId == userId) {
      const tr = document.createElement("tr");
      const qrCell = document.createElement("td");
      const qrCanvas = document.createElement('canvas');
      qrCell.appendChild(qrCanvas);
      console.log(med.medicineId);
      tr.innerHTML = `
          <td>${med.medicineId}</td>
          <td>${medicineDatabase?.[med.medicineId]?.name || "Không có"}</td>
          <td>${formatDate(med.productionDate)}</td>
          <td>${formatDate(med.expiryDate)}</td>
          <td>${med.batchId}</td>
          <td>${med.totalQuantity}</td>
          <td>${med.logId}</td>
      `;
      tr.appendChild(qrCell);
      manufacturerMedicines.appendChild(tr);

      // Generate QR Code
      QRCode.toCanvas(qrCanvas, med.logId, { width: 50, margin: 1 }, function (error) {
        if (error) console.error('QR Code generation error:', error);
      });
    }
  });
}

// --- Event Listener Setup --- 

function setupTabNavigation() {
  const tabLinks = document.querySelectorAll(".tab-link");
  const tabContents = document.querySelectorAll(".tab-content");

  // Add click event to all tab links
  tabLinks.forEach((link) => {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      const tabId = this.getAttribute("data-tab");

      // Update active state for links
      tabLinks.forEach(l => l.classList.remove('is-active'));
      this.classList.add('is-active');
      // Also update sidebar links if they exist
      document.querySelectorAll('.menu-list .tab-link').forEach(sl => {
          if (sl.getAttribute('data-tab') === tabId) {
              sl.classList.add('is-active');
          } else {
              sl.classList.remove('is-active');
          }
      });

      // Hide all tab contents
      tabContents.forEach((content) => {
        content.classList.add("is-hidden");
      });

      // Show selected tab content
      const selectedTab = document.getElementById(tabId);
      if (selectedTab) {
        selectedTab.classList.remove("is-hidden");
      }
    });
  });

  // Show default tab ('manufacturer')
  document.getElementById('manufacturer').classList.remove('is-hidden');
  // Ensure default links are active
  document.querySelectorAll('.tab-link[data-tab="manufacturer"]').forEach(link => link.classList.add('is-active'));
}

function setupManufacturerEventListeners(userId, token) {
  const generateBtn = document.getElementById("generate-medicine-button");
  if (generateBtn) {
      generateBtn.addEventListener("click", async () => {
        const medicineId = document.getElementById("new-medicine-code").value.trim();
        const productionDate = document.getElementById("new-medicine-production-date").value;
        const expiryDate = document.getElementById("new-medicine-expiry-date").value;
        const batch = document.getElementById("new-medicine-batch").value.trim();
        const quantityInput = document.getElementById("new-medicine-quantity");
        const quantity = parseInt(quantityInput.value.trim(), 10);

        if (!medicineId || !productionDate || !expiryDate || !batch || isNaN(quantity) || quantity <= 0) {
          alert("Vui lòng điền đầy đủ và chính xác thông tin thuốc (Số lượng phải là số dương).");
          return;
        }

        const user = getUserById("1", userId);
        const manufacturerId = user ? user.id : null;
        if (!manufacturerId) {
            alert("Lỗi: Không xác định được mã nhà sản xuất.");
            return;
        }
        if (!token) return; // Stop if token fetch failed

        // Call API
        try {
          const response = await fetch(`http://${ip.host}:${ip.backend}/api/createMedicine`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              medicineId,
              batchId: batch,
              manufacturerId,
              productionDate,
              expiryDate,
              quantity,
              token
            })
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Lỗi khi tạo thuốc");
          }

          alert("Tạo thuốc thành công! Log ID: " + data.response.logId); // Assuming API returns logId
          
          // Refresh manufacturer data
          await getDataMedicineCreate(userId, token); // Re-fetch the created medicine list
          loadManufacturerData(userId);

          // Clear form
          document.getElementById("add-medicine-form").reset();

        } catch (error) {
          console.error("Error creating medicine:", error);
          alert(`Lỗi khi tạo thuốc: ${error.message}`);
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


document.getElementById("new-medicine-code").addEventListener("blur", () => {
    const medicineId = document.getElementById("new-medicine-code").value.trim();

    if (!medicineId) {
        alert("Vui lòng nhập mã thuốc.");
        return;
    }

    if (medicineDatabase[medicineId]) {
        const med = medicineDatabase[medicineId];

        // Fill bảng thông tin
        document.getElementById("info-name").textContent = med.name || '';
        document.getElementById("info-type").textContent = med.type || '';
        document.getElementById("info-shape").textContent = med.shape || '';
        document.getElementById("info-temperature").textContent = med.temperature || '';
        document.getElementById("info-humidity").textContent = med.humidity || '';
        document.getElementById("info-light").textContent = med.light || '';

        // Show bảng
        document.getElementById("medicine-info-box").style.display = 'block';
    } else {
        alert("Mã thuốc không tồn tại trong cơ sở dữ liệu.");
        document.getElementById("medicine-info-box").style.display = 'none';
    }
});

document.getElementById("new-medicine-production-date").addEventListener("change", () => {
    const productionDateInput = document.getElementById("new-medicine-production-date");
    const expiryDateInput = document.getElementById("new-medicine-expiry-date");
    const medicineId = document.getElementById("new-medicine-code").value.trim();

    if (!medicineDatabase[medicineId]) return;

    const expiryMonths = parseInt(medicineDatabase[medicineId].expiryMonths || "0");
    const productionDate = new Date(productionDateInput.value);

    if (isNaN(productionDate.getTime()) || expiryMonths === 0) return;

    const expiryDate = new Date(productionDate);
    expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);

    expiryDateInput.value = expiryDate.toISOString().split("T")[0]; // format yyyy-mm-dd
});


// --- Main Initialization --- 

document.addEventListener("DOMContentLoaded", async () => {
  // Get URL parameters
  const params = new URLSearchParams(window.location.search);
  const roleId = params.get("role");
  const userId = params.get("userId");
  const token = await getTokenById("admin", "adminpw"); // Get token for manufacturer actions

  // Basic validation
  if (roleId !== "1") { // Ensure this is the manufacturer dashboard
      alert("Lỗi: Vai trò không hợp lệ cho trang này.");
      window.location.href = "../index.html"; // Redirect to login
      return;
  }
  if (!userId) {
      alert("Lỗi: Không tìm thấy mã người dùng.");
      window.location.href = "../index.html";
      return;
  }

  // Fetch initial data
  await getData(); // Get manufacturer list
  await getDataMedicine(); // Get general medicine definitions
  await getDataMedicineCreate(userId, token); // Get created medicine logs

  const user = getUserById(roleId, userId);
  
  if (!user) {
    alert("Không tìm thấy thông tin người dùng cho mã ID này.");
    window.location.href = "../index.html";
    return;
  }

  // Set user info in the UI
  // document.getElementById("user-role").textContent = getRoleName(roleId); // Already set in HTML
  document.getElementById("user-name").textContent = user.name;
  
  // Setup UI elements
  setupTabNavigation(); // Setup clicks for tabs

  // Load initial data into tabs
  loadDashboardData(); // Load overview stats
  loadMedicinesData(); // Load general medicine list
  loadManufacturerData(userId); // Load manufacturer-specific production list

  // Setup event listeners for manufacturer actions and tracking tab
  setupManufacturerEventListeners(userId, token);
  setupTrackingEventListeners(); 

});

console.log("Manufacturer Dashboard JS Loaded");

