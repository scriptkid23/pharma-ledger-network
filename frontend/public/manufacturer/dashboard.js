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

// Fetch logs of medicines created (likely by any manufacturer, might need filtering later)
async function getDataMedicineCreate() {
  try {
      await fetch(`http://${ip.host}:${ip.backend}/api/getAllMedicineCreate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(res => res.json())
        .then(data => {
          medicineCraete = data.response || []; // Ensure it's an array
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
    const tr = document.createElement("tr");
    const qrCell = document.createElement("td");
    const qrCanvas = document.createElement('canvas');
    qrCell.appendChild(qrCanvas);

    tr.innerHTML = `
        <td>${med.medicineId}</td>
        <td>${med.name}</td>
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

function setupManufacturerEventListeners(userId) {
  const generateBtn = document.getElementById("generate-medicine-button");
  if (generateBtn) {
      generateBtn.addEventListener("click", async () => {
        const medicineId = document.getElementById("new-medicine-code").value.trim();
        const name = document.getElementById("new-medicine-name").value.trim();
        const productionDate = document.getElementById("new-medicine-production-date").value;
        const expiryDate = document.getElementById("new-medicine-expiry-date").value;
        const batch = document.getElementById("new-medicine-batch").value.trim();
        const quantityInput = document.getElementById("new-medicine-quantity");
        const quantity = parseInt(quantityInput.value.trim(), 10);

        if (!medicineId || !name || !productionDate || !expiryDate || !batch || isNaN(quantity) || quantity <= 0) {
          alert("Vui lòng điền đầy đủ và chính xác thông tin thuốc (Số lượng phải là số dương).");
          return;
        }

        const user = getUserById("1", userId);
        const manufacturerId = user ? user.id : null;
        if (!manufacturerId) {
            alert("Lỗi: Không xác định được mã nhà sản xuất.");
            return;
        }

        // Get token
        const token = await getTokenById("admin", "adminpw"); // Use appropriate credentials
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
              name,
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

          alert("Tạo thuốc thành công! Log ID: " + data.logId); // Assuming API returns logId
          
          // Refresh manufacturer data
          await getDataMedicineCreate(); // Re-fetch the created medicine list
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

            const historyData = await getMedicineByLogId(logId);

            if (!historyData || historyData.length === 0) {
                detailsBox.innerHTML = '<p>Không tìm thấy thông tin cho mã ghi nhận này.</p>';
                resultsDiv.classList.remove('is-hidden');
                return;
            }

            // Display details of the first record (creation event)
            const firstRecord = historyData[0];
            detailsBox.innerHTML = `
                <p><strong>Mã thuốc:</strong> ${firstRecord.medicineId}</p>
                <p><strong>Tên thuốc:</strong> ${firstRecord.name}</p>
                <p><strong>Nhà sản xuất:</strong> ${firstRecord.manufacturerId}</p> 
                <p><strong>Ngày sản xuất:</strong> ${formatDate(firstRecord.productionDate)}</p>
                <p><strong>Hạn sử dụng:</strong> ${formatDate(firstRecord.expiryDate)}</p>
                <p><strong>Lô sản xuất:</strong> ${firstRecord.batchId}</p>
                <p><strong>Số lượng ban đầu:</strong> ${firstRecord.quantity}</p>
                <p><strong>Mã ghi nhận (Log ID):</strong> ${firstRecord.logId}</p>
            `;
             // Add manufacturer name if available in userData
             // const manufacturer = userData[1]?.find(m => m.id === firstRecord.manufacturerId);
             // if (manufacturer) { detailsBox.innerHTML += `<p><strong>Tên Nhà sản xuất:</strong> ${manufacturer.name}</p>`; }

            // Display history (excluding the first creation record)
            if (historyData.length > 1) {
                historyData.slice(1).forEach(item => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <div class="timeline-item">
                            <div class="timeline-marker is-info"></div>
                            <div class="timeline-content">
                            <p class="heading">${formatDate(item.timestamp)}</p>
                            <p>
                                <strong>${item.fromId}</strong> 
                                đã chuyển <strong>${item.totalQuantity || item.quantity}</strong> đơn vị đến 
                                <strong>${item.toId}</strong>
                            </p>
                            <p class="is-size-7">Mã chuyển: ${item.logId}</p> 
                            </div>
                        </div>
                    `;
                     // Add names if available
                     // const fromUser = findUserAnyRole(item.fromId);
                     // const toUser = findUserAnyRole(item.toId);
                     // li.querySelector('.timeline-content p:nth-child(2)').innerHTML = `...`; // Update with names
                    historyList.appendChild(li);
                });
            } else {
                historyList.innerHTML = '<li>Không có lịch sử phân phối nào được ghi nhận.</li>';
            }
            
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
  // Get URL parameters
  const params = new URLSearchParams(window.location.search);
  const roleId = params.get("role");
  const userId = params.get("userId");

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
  await getDataMedicineCreate(); // Get created medicine logs

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
  setupManufacturerEventListeners(userId);
  setupTrackingEventListeners(); 

});

console.log("Manufacturer Dashboard JS Loaded");

