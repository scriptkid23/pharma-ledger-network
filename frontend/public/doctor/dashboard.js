const ip = {
    "host": "10.10.2.137",
    "backend": "3001",
    "frontend": "8080",
    "fablo": "8801"
};

let userData = {
  1: [
    // Manufacturers

  ],
  2: [
    // Distributors
    
  ],
  3: [
    // Pharmacies
    
  ],
  4: [
    // Doctors
    { id: 401, name: "Bác sĩ Nguyễn Văn A" },
    { id: 402, name: "Bác sĩ Trần Thị B" },
    { id: 403, name: "Bác sĩ Lê Văn C" },
  ],
  5: [
    // Patients
    { id: 501, name: "Nguyễn Văn X" },
    { id: 502, name: "Trần Thị Y" },
    { id: 503, name: "Lê Văn Z" },
  ],
}

async function getData() {
  try {
    
    const nsx = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaSanXuat`).then(res => res.json());
    const npp = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaPhanPhoi`).then(res => res.json());
    const nt = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaThuoc`).then(res => res.json());
    // ✅ Luôn giữ dạng MẢNG
    userData[1] = nsx.map(item => ({
      id: item.MA_NHASX,
      name: item.TEN_NHASX
    }));

    userData[2] = npp.map(item => ({
      id: item.MA_NHAPP,
      name: item.TEN_NHAPP
    }));

    userData[3] = nt.map(item => ({
      id: item.MA_NHA_THUOC,
      name: item.TEN_NHA_THUOC
    }));

  } catch (error) {
    console.error("Error fetching data:", error);
  }
}


// Update the medicine database structure to handle duplicate medicine IDs with unique log IDs
const medicineDatabase = {
  
}

async function getDataMedicine() {
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
          // Bảo quản
          temperature: item.NHIET_DO,
          humidity: item.DO_AM,
          light: item.ANH_SANG
        };
      });
    })
    .catch(err => console.error('Lỗi fetch thuốc:', err));
}

let medicineCraete = []

async function getTokenById(id, secret) {
  const response = await fetch(`http://${ip.host}:${ip.fablo}/user/enroll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id,
      secret
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result.token;
}


async function getDataMedicineCreate() {


  await fetch(`http://${ip.host}:${ip.backend}/api/getAllMedicineCreate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then(res => res.json())
    .then(data => {
  // console.log("Kết quả từ API:", data);
  medicineCraete = data.response;
})

    .catch(err => console.error('Lỗi fetch thuốc:', err));
}

// Add order request database for distributor approval workflow
const orderRequestDatabase = [
  {
    id: "REQ001",
    pharmacyId: 301,
    distributorId: 201,
    date: "2025-04-08",
    status: "Chờ phê duyệt",
    items: [
      { logId: "LOG20250115-001", quantity: 50 },
      { logId: "LOG20250305-001", quantity: 30 },
    ],
  },
  {
    id: "REQ002",
    pharmacyId: 303,
    distributorId: 203,
    date: "2025-04-09",
    status: "Đã phê duyệt",
    items: [{ logId: "LOG20250210-001", quantity: 40 }],
  },
]

// Update prescription database to include approval status and use log IDs
const prescriptionDatabase = [
  {
    id: "PRES001",
    doctorId: 401,
    patientId: 501,
    date: "2025-04-10",
    medicines: [
      { medicineId: "MED001", logId: "LOG20250115-001", dosage: "1 viên x 3 lần/ngày", duration: "5 ngày" },
      { medicineId: "MED003", logId: "LOG20250305-001", dosage: "1 viên x 1 lần/ngày", duration: "7 ngày" },
    ],
    status: "Đã phê duyệt bởi bác sĩ",
    patientApproval: true,
  },
  {
    id: "PRES002",
    doctorId: 402,
    patientId: 502,
    date: "2025-04-12",
    medicines: [{ medicineId: "MED002", logId: "LOG20250210-001", dosage: "1 viên x 2 lần/ngày", duration: "7 ngày" }],
    status: "Đã phê duyệt bởi bác sĩ",
    patientApproval: true,
  },
]

// Update order database to include approval status and use log IDs
const orderDatabase = [
  {
    id: "ORD001",
    patientId: 501,
    pharmacyId: 301,
    prescriptionId: "PRES001",
    date: "2025-04-11",
    status: "Đã xử lý",
    doctorApproval: true,
    patientApproval: true,
    items: [
      { medicineId: "MED001", logId: "LOG20250115-001", quantity: 15 },
      { medicineId: "MED003", logId: "LOG20250305-001", quantity: 7 },
    ],
  },
  {
    id: "ORD002",
    patientId: 502,
    pharmacyId: 303,
    prescriptionId: "PRES002",
    date: "2025-04-13",
    status: "Chờ phê duyệt",
    doctorApproval: false,
    patientApproval: true,
    items: [{ medicineId: "MED002", logId: "LOG20250210-001", quantity: 14 }],
  },
]

// Update inventory database to use log IDs
const inventoryDatabase = {
  // Distributor inventory
  201: [
    { logId: "LOG20250115-001", quantity: 500 },
    { logId: "LOG20250210-001", quantity: 300 },
    { logId: "LOG20250305-001", quantity: 400 },
    { logId: "LOG20250320-001", quantity: 200 }, // New batch of MED001
  ],
  202: [
    { logId: "LOG20250115-001", quantity: 400 },
    { logId: "LOG20250210-001", quantity: 350 },
    { logId: "LOG20250305-001", quantity: 450 },
  ],
  203: [
    { logId: "LOG20250115-001", quantity: 450 },
    { logId: "LOG20250210-001", quantity: 400 },
    { logId: "LOG20250305-001", quantity: 350 },
  ],
  // Pharmacy inventory
  301: [
    { logId: "LOG20250115-001", quantity: 100 },
    { logId: "LOG20250305-001", quantity: 80 },
  ],
  302: [{ logId: "LOG20250305-001", quantity: 90 }],
  303: [{ logId: "LOG20250210-001", quantity: 120 }],
}

// Recent activity
const recentActivity = [
  { date: "2025-04-13", entity: "Nhà thuốc Pharmacity", action: "Nhận đơn hàng mới (ORD002)" },
  { date: "2025-04-12", entity: "Bác sĩ Trần Thị B", action: "Tạo đơn thuốc mới (PRES002)" },
  { date: "2025-04-11", entity: "Nhà thuốc Long Châu", action: "Xử lý đơn hàng (ORD001)" },
  { date: "2025-04-10", entity: "Bác sĩ Nguyễn Văn A", action: "Tạo đơn thuốc mới (PRES001)" },
  { date: "2025-03-25", entity: "Nhà thuốc An Khang", action: "Nhập kho thuốc (MED003)" },
  { date: "2025-03-15", entity: "Công ty Phân phối Dược phẩm Miền Trung", action: "Nhập kho thuốc (MED003)" },
  { date: "2025-03-10", entity: "Công ty Dược phẩm Traphaco", action: "Sản xuất thuốc mới (MED003)" },
]

// Helper functions
function getUserById(roleId, userId) {
  if (userData[roleId]) {
    return userData[roleId].find((user) => user.id == userId)
  }
  return null
}

// Update helper functions to work with the new database structure
async function getMedicineByLogId(logId) {
  const response = await fetch(`http://${ip.host}:${ip.backend}/api/getMedicineByLogId`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ logId })
  }).then(response => response.json())
  .then(data => {
    return data
  }
  ).catch(error => {
    console.error('Error fetching medicine data:', error)
  })
  console.log(response.response)
  return response.response || []
}


function getMedicinesByMedicineId(medicineId) {
  return Object.values(medicineDatabase).filter((medicine) => medicine.medicineId === medicineId)
}

function getPrescriptionById(prescriptionId) {
  return prescriptionDatabase.find((prescription) => prescription.id === prescriptionId)
}

function getOrderById(orderId) {
  return orderDatabase.find((order) => order.id === orderId)
}

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString("vi-VN")
}

async function main(roleId, userId) {
  await getData();
  await getDataMedicine();
  const user = getUserById(roleId, userId)
  console.log(user)
  return user
}
// Main function
document.addEventListener("DOMContentLoaded", async () => {
  // Get URL parameters
  const params = new URLSearchParams(window.location.search)
  const roleId = params.get("role")
  const userId = params.get("userId")
  const user = await main(roleId, userId); // GỌI HÀM CHÍNH
  // Get user info
  if (!user) {
    alert("Không tìm thấy thông tin người dùng")
    window.location.href = "index.html"
    return
  }

  // Set user info
  document.getElementById("user-role").textContent = getRoleName(roleId)
  document.getElementById("user-name").textContent = user.name
  // Setup role-specific menu
  await setupRoleSpecificMenu(roleId)

  // Setup tab navigation
  setupTabNavigation(roleId)

  // Load dashboard data
  loadDashboardData()

  // Load role-specific data
  loadRoleSpecificData(roleId, userId)

  // Load medicines data
  loadMedicinesData()

  // Setup event listeners
  setupEventListeners(roleId, userId)
})

function getRoleName(roleId) {
  const roleNames = {
    1: "Nhà sản xuất",
    2: "Nhà phân phối",
    3: "Nhà thuốc",
    4: "Bác sĩ",
    5: "Bệnh nhân",
  }

  return roleNames[roleId] || "Không xác định"
}

async function setupRoleSpecificMenu(roleId) {
  const roleMenu = document.getElementById("role-specific-menu")
  const roleActions = document.getElementById("role-actions")

  // Clear existing menu items
  roleMenu.innerHTML = ""
  roleActions.innerHTML = ""

  // Add role-specific menu items
  switch (roleId) {
    case "1": // Manufacturer
      await getDataMedicineCreate();
      roleMenu.innerHTML = `
                <a class="tab-link" data-tab="manufacturer">Quản lý sản xuất</a>
            `
      roleActions.innerHTML = `
                <a class="navbar-item tab-link" data-tab="manufacturer">Quản lý sản xuất</a>
            `
      break
    case "2": // Distributor
      await getDataMedicineCreate();
      roleMenu.innerHTML = `
                <a class="tab-link" data-tab="distributor">Quản lý phân phối</a>
            `
      roleActions.innerHTML = `
                <a class="navbar-item tab-link" data-tab="distributor">Quản lý phân phối</a>
            `
      break
    case "3": // Pharmacy
      roleMenu.innerHTML = `
                <a class="tab-link" data-tab="pharmacy">Quản lý nhà thuốc</a>
            `
      roleActions.innerHTML = `
                <a class="navbar-item tab-link" data-tab="pharmacy">Quản lý nhà thuốc</a>
            `
      break
    case "4": // Doctor
      roleMenu.innerHTML = `
                <a class="tab-link" data-tab="doctor">Quản lý kê đơn</a>
            `
      roleActions.innerHTML = `
                <a class="navbar-item tab-link" data-tab="doctor">Quản lý kê đơn</a>
            `
      break
    case "5": // Patient
      roleMenu.innerHTML = `
                <a class="tab-link" data-tab="patient">Quản lý đơn thuốc</a>
            `
      roleActions.innerHTML = `
                <a class="navbar-item tab-link" data-tab="patient">Quản lý đơn thuốc</a>
            `
      break
  }
}

function setupTabNavigation(roleId) {
  const tabLinks = document.querySelectorAll(".tab-link")
  const tabContents = document.querySelectorAll(".tab-content")

  // Add click event to all tab links
  tabLinks.forEach((link) => {
    link.addEventListener("click", function () {
      const tabId = this.getAttribute("data-tab")

      // Hide all tab contents
      tabContents.forEach((content) => {
        content.classList.add("is-hidden")
      })

      // Show selected tab content
      const selectedTab = document.getElementById(tabId)
      if (selectedTab) {
        selectedTab.classList.remove("is-hidden")
      }
    })
  })

  // Show default tab based on role
  let defaultTab = "dashboard"
  switch (roleId) {
    case "1":
      defaultTab = "manufacturer"
      break
    case "2":
      defaultTab = "distributor"
      break
    case "3":
      defaultTab = "pharmacy"
      break
    case "4":
      defaultTab = "doctor"
      break
    case "5":
      defaultTab = "patient"
      break
  }

  // Hide all tab contents
  tabContents.forEach((content) => {
    content.classList.add("is-hidden")
  })

  // Show default tab
  const defaultTabContent = document.getElementById(defaultTab)
  if (defaultTabContent) {
    defaultTabContent.classList.remove("is-hidden")
  }
}

function loadDashboardData() {
  // Set dashboard statistics - count unique medicine IDs
  const uniqueMedicineIds = new Set(Object.values(medicineDatabase).map((med) => med.medicineId))
  document.getElementById("total-medicines").textContent = uniqueMedicineIds.size
  document.getElementById("total-batches").textContent = Object.keys(medicineDatabase).length
  document.getElementById("total-orders").textContent = orderDatabase.length
  document.getElementById("total-prescriptions").textContent = prescriptionDatabase.length

  // Load recent activity
  const activityList = document.getElementById("activity-list")
  activityList.innerHTML = ""

  recentActivity.forEach((activity) => {
    const li = document.createElement("li")
    li.innerHTML = `<strong>${activity.date}</strong>: ${activity.entity} - ${activity.action}`
    activityList.appendChild(li)
  })
}

function loadRoleSpecificData(roleId, userId) {
  switch (roleId) {
    case "1": // Manufacturer
      loadManufacturerData(userId)
      break
    case "2": // Distributor
      loadDistributorData(userId)
      break
    case "3": // Pharmacy
      loadPharmacyData(userId)
      break
    case "4": // Doctor
      loadDoctorData(userId)
      break
    case "5": // Patient
      loadPatientData(userId)
      break
  }
}

function setupManufacturerEventListeners(userId) {
  document.getElementById("generate-medicine-button").addEventListener("click", async () => {
    const medicineId = document.getElementById("new-medicine-code").value.trim();
    const name = document.getElementById("new-medicine-name").value.trim();
    const productionDate = document.getElementById("new-medicine-production-date").value;
    const expiryDate = document.getElementById("new-medicine-expiry-date").value;
    const batch = document.getElementById("new-medicine-batch").value.trim();
    const quantity = document.getElementById("new-medicine-quantity").value.trim();

    if (!medicineId || !name || !productionDate || !expiryDate || !batch) {
      alert("Vui lòng điền đầy đủ thông tin");
      return;
    }

    // Lấy user info
    const user = getUserById("1", userId);
    const manufacturerId = user ? user.id : "unknown"; // Cần id để gửi lên API
    const manufacturerName = user ? user.name : "Không xác định";

    // Tạo logId kiểu LOGYYYYMMDD-XXX
    const prodDate = new Date(productionDate);
    const year = prodDate.getFullYear();
    const month = String(prodDate.getMonth() + 1).padStart(2, "0");
    const day = String(prodDate.getDate()).padStart(2, "0");

    const datePrefix = `LOG${year}${month}${day}`;
    let count = 1;

    Object.values(medicineDatabase).forEach((medicine) => {
      if (medicine.logId && medicine.logId.startsWith(datePrefix)) {
        count++;
      }
    });
    const token = await getTokenById("admin", "adminpw"); // Lấy token cho nhà sản xuất
    // Gọi API tạo medicine (nhớ gửi đúng payload nha)
    try {
      const response = await fetch(`http://${ip.host}:${ip.backend}/api/createMedicine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          medicineId: medicineId,
          batchId: batch,
          name: name,
          manufacturerId: manufacturerId,
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

      // Load lại dữ liệu manufacturer (nếu cần)
      loadManufacturerData(userId);

      // Xóa form
      document.getElementById("new-medicine-code").value = "";
      document.getElementById("new-medicine-name").value = "";
      document.getElementById("new-medicine-production-date").value = "";
      document.getElementById("new-medicine-expiry-date").value = "";
      document.getElementById("new-medicine-batch").value = "";
      document.getElementById("new-medicine-quantity").value = "";

    } catch (error) {
      alert(`Lỗi: ${error.message}`);
      console.error(error);
    }
  });
}


// Update loadManufacturerData function to display all batches
function loadManufacturerData(userId) {
  const manufacturerMedicines = document.getElementById("manufacturer-medicines")
  manufacturerMedicines.innerHTML = ""
  
  // Filter medicines by manufacturer
  Object.entries(medicineCraete).forEach(([logId, medicine]) => {
    if (medicine.manufacturerId === userId && medicine.action === "CREATE") {
      const tr = document.createElement("tr")
      tr.innerHTML = `
              <td>${medicine.medicineId}</td>
              <td>${medicineDatabase[medicine.medicineId].name}</td>
              <td>${formatDate(medicine.productionDate)}</td>
              <td>${formatDate(medicine.expiryDate)}</td>
              <td>${medicine.batchId}</td>
              <td>${medicine.totalQuantity}</td>
              <td>${medicine.logId}</td>
              <td>
                  <div class="qrcode" data-logid="${medicine.logId}"></div>
              </td>
          `
      manufacturerMedicines.appendChild(tr)

      // Generate QR code with log ID
      const qrContainer = tr.querySelector(".qrcode")
      if (typeof QRCode !== "undefined") {
        QRCode.toCanvas(qrContainer, medicine.logId, { width: 80 }, (error) => {
          if (error) console.error(error)
        })
      }
    }
  })
}

// Update setupDistributorEventListeners function to work with log IDs
function setupDistributorEventListeners(userId) {
  // Receive medicine button
  document.getElementById("receive-medicine-button").addEventListener("click", async () => {
    const logId = document.getElementById("receive-medicine-logid").value.trim()
    const quantity = Number.parseInt(document.getElementById("receive-medicine-quantity").value)
    const storage = document.getElementById("storage-select").value.trim()

    if (!logId || isNaN(quantity) || quantity <= 0) {
      alert("Vui lòng điền đầy đủ thông tin")
      return
    }
    const medicines = await getMedicineByLogId(logId);
    const latestMedicine = medicines[medicines.length - 1];

    console.log(medicines)

    if (!latestMedicine) {
      alert("Không tìm thấy thông tin thuốc")
      return
    }
    const getToken = async () => {
      if (storage == 1) {
        return getTokenById("admin", "adminpw")
      }
      if (storage == 2) {
        return getTokenById("admin", "adminpw")
      }
      return null;
    }
    const token = await getToken();
    // Get distributor info
    const user = getUserById("2", userId)
    // Update medicine history with log ID
    fetch(`http://${ip.host}:${ip.backend}/api/Inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        logId,
        fromId: latestMedicine?.toId || latestMedicine.manufacturerId,
        toId: "K00" + storage,
        transferCompanyId: userId,
        quantity,
        token
      })
    }).then(res => res.json())

    // Update inventory
    if (!inventoryDatabase[userId]) {
      inventoryDatabase[userId] = []
    }

    const existingItem = inventoryDatabase[userId].find((item) => item.logId === logId)

    if (existingItem) {
      existingItem.quantity += quantity
    } else {
      inventoryDatabase[userId].push({ logId: logId, quantity: quantity })
    }

    // Reload distributor data
    loadDistributorData(userId)

    // Clear form
    document.getElementById("receive-medicine-logid").value = ""
    document.getElementById("receive-medicine-quantity").value = ""

    alert("Nhập kho thuốc thành công")
  })

  // Approve order request button
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("approve-request-button")) {
      const requestId = event.target.getAttribute("data-request")
      approveOrderRequest(requestId, userId)
    }
  })

  // Reject order request button
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("reject-request-button")) {
      const requestId = event.target.getAttribute("data-request")
      rejectOrderRequest(requestId, userId)
    }
  })
}

// Add function to approve order request
function approveOrderRequest(requestId, distributorId) {
  const request = orderRequestDatabase.find((req) => req.id === requestId)

  if (!request) {
    alert("Không tìm thấy yêu cầu")
    return
  }

  // Check inventory
  let canFulfill = true
  const inventory = inventoryDatabase[distributorId] || []

  request.items.forEach((item) => {
    const inventoryItem = inventory.find((invItem) => invItem.logId === item.logId)
    if (!inventoryItem || inventoryItem.quantity < item.quantity) {
      canFulfill = false
    }
  })

  if (!canFulfill) {
    alert("Số lượng thuốc trong kho không đủ để đáp ứng yêu cầu")
    return
  }

  // Update request status
  request.status = "Đã phê duyệt"

  // Update inventory
  request.items.forEach((item) => {
    const inventoryItem = inventory.find((invItem) => invItem.logId === item.logId)
    inventoryItem.quantity -= item.quantity

    // Update pharmacy inventory
    if (!inventoryDatabase[request.pharmacyId]) {
      inventoryDatabase[request.pharmacyId] = []
    }

    const pharmacyItem = inventoryDatabase[request.pharmacyId].find((invItem) => invItem.logId === item.logId)

    if (pharmacyItem) {
      pharmacyItem.quantity += item.quantity
    } else {
      inventoryDatabase[request.pharmacyId].push({ logId: item.logId, quantity: item.quantity })
    }

    // Update medicine history
    const medicine = getMedicineByLogId(item.logId)
    const distributor = getUserById("2", distributorId)
    const distributorName = distributor ? distributor.name : "Không xác định"
    const pharmacy = getUserById("3", request.pharmacyId)
    const pharmacyName = pharmacy ? pharmacy.name : "Không xác định"

    if (medicine) {
      medicine.history.push({
        date: new Date().toISOString().split("T")[0],
        entity: distributorName,
        action: `Xuất kho đến ${pharmacyName}`,
        logId: medicine.logId,
      })

      medicine.history.push({
        date: new Date().toISOString().split("T")[0],
        entity: pharmacyName,
        action: "Nhập kho",
        logId: medicine.logId,
      })
    }
  })

  // Reload distributor data
  loadDistributorData(distributorId)

  alert("Phê duyệt yêu cầu thành công")
}

// Add function to reject order request
function rejectOrderRequest(requestId, distributorId) {
  const request = orderRequestDatabase.find((req) => req.id === requestId)

  if (!request) {
    alert("Không tìm thấy yêu cầu")
    return
  }

  // Update request status
  request.status = "Từ chối"

  // Reload distributor data
  loadDistributorData(distributorId)

  alert("Từ chối yêu cầu thành công")
}

// Update loadDistributorData function to work with log IDs
async function loadDistributorData(userId) {
  // Load distributor inventory
  const distributorInventory = document.getElementById("distributor-inventory")
  distributorInventory.innerHTML = ""

  // Get distributor inventory
  const inventory = inventoryDatabase[userId] || []

  // Gọi 1 lần rồi xử lý trong vòng lặp
  const response = await fetch(`http://${ip.host}:${ip.backend}/api/getAllMedicineCreate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json();
  const allMedicines = data.response;

  allMedicines.forEach((medicine) => {
    console.log(medicine);
    if (medicine.action == "INBOUND" && medicine.transferCompanyId == userId) {
      const distributedTo = medicine.distributedQuantities
        ? Object.keys(medicine.distributedQuantities)[0] || "Unknown"
        : "Unknown";

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${medicine.medicineId}</td>
        <td>${medicine.name || 'Unknown'}</td>
        <td>${1}</td>
        <td>${formatDate(medicine.expiryDate)}</td>
        <td>${distributedTo}</td>
        <td>${medicine.logId}</td>
        <td>${medicine.batchId || 'N/A'}</td>
      `;
      distributorInventory.appendChild(tr);
    }
  });


  // Load order requests
  const orderRequests = document.getElementById("order-requests")
  orderRequests.innerHTML = ""

  // Filter requests by distributor
  const filteredRequests = orderRequestDatabase.filter((req) => req.distributorId == userId)

  filteredRequests.forEach((request) => {
    const pharmacy = getUserById("3", request.pharmacyId)
    const pharmacyName = pharmacy ? pharmacy.name : "Không xác định"

    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td>${request.id}</td>
      <td>${pharmacyName}</td>
      <td>${formatDate(request.date)}</td>
      <td>${request.status}</td>
      <td>
        ${
          request.status === "Chờ phê duyệt"
            ? `
          <button class="button is-small is-success approve-request-button" data-request="${request.id}">Phê duyệt</button>
          <button class="button is-small is-danger reject-request-button" data-request="${request.id}">Từ chối</button>
        `
            : `
          <button class="button is-small is-info view-request" data-request="${request.id}">Xem</button>
        `
        }
      </td>
    `
    orderRequests.appendChild(tr)
  })
}

// Update loadPharmacyData function to work with log IDs
function loadPharmacyData(userId) {
  // Load pharmacy orders
  const pharmacyOrders = document.getElementById("pharmacy-orders")
  pharmacyOrders.innerHTML = ""

  // Filter orders by pharmacy
  const filteredOrders = orderDatabase.filter((order) => order.pharmacyId == userId)

  filteredOrders.forEach((order) => {
    const patient = getUserById("5", order.patientId)
    const patientName = patient ? patient.name : "Không xác định"

    const tr = document.createElement("tr")
    tr.innerHTML = `
            <td>${order.id}</td>
            <td>${patientName}</td>
            <td>${formatDate(order.date)}</td>
            <td>${order.status}</td>
            <td>
                <span class="tag ${order.doctorApproval ? "is-success" : "is-danger"}">
                    Bác sĩ: ${order.doctorApproval ? "Đã duyệt" : "Chưa duyệt"}
                </span>
                <span class="tag ${order.patientApproval ? "is-success" : "is-danger"}">
                    Bệnh nhân: ${order.patientApproval ? "Đã duyệt" : "Chưa duyệt"}
                </span>
            </td>
            <td>
                <button class="button is-small is-info view-order" data-order="${order.id}">Xem</button>
                ${
                  order.doctorApproval && order.patientApproval && order.status === "Chờ xử lý"
                    ? `<button class="button is-small is-success process-order" data-order="${order.id}">Xử lý</button>`
                    : ""
                }
            </td>
        `
    pharmacyOrders.appendChild(tr)
  })

  // Load pharmacy inventory
  const pharmacyInventory = document.getElementById("pharmacy-inventory")
  pharmacyInventory.innerHTML = ""

  // Get pharmacy inventory
  const inventory = inventoryDatabase[userId] || []

  inventory.forEach((item) => {
    const medicine = getMedicineByLogId(item.logId)
    if (medicine) {
      const tr = document.createElement("tr")
      tr.innerHTML = `
                <td>${medicine.medicineId}</td>
                <td>${medicineDatabase[medicine.medicineId].name}</td>
                <td>${item.quantity}</td>
                <td>${formatDate(medicine.expiryDate)}</td>
                <td>${medicine.logId}</td>
                <td>${medicine.batch}</td>
            `
      pharmacyInventory.appendChild(tr)
    }
  })
}

// Update setupPharmacyEventListeners function to work with log IDs
function setupPharmacyEventListeners(userId) {
  const distributorData = document.getElementById("request-distributor")
  userData["2"].forEach((dis) => {
    const option = document.createElement("option");
    option.value = dis.id;
    option.text = dis.name;
    document.getElementById("request-distributor").appendChild(option);
  })

  // Create order request button
  document.getElementById("create-request-button").addEventListener("click", () => {
    const distributorId = distributorData.value;
    if (!distributorId) {
      alert("Vui lòng chọn nhà phân phối")
      return
    }

    // Get request items
    const itemElements = document.querySelectorAll(".request-item")
    const items = []

    let isValid = true

    itemElements.forEach((element) => {
      const medicineId = element.getElementById("request-medicine").value
      const quantity = Number.parseInt(element.getElementById("request-quantity").value)

      if (!medicineId || !logId || isNaN(quantity) || quantity <= 0) {
        isValid = false
        return
      }

      items.push({
        medicineId: medicineId,
        logId: logId,
        quantity: quantity,
      })
    })

    if (!isValid || items.length === 0) {
      alert("Vui lòng điền đầy đủ thông tin thuốc")
      return
    }

    // Generate request ID
    const requestId = `REQ${orderRequestDatabase.length + 1}`.padStart(6, "0")

    // Add new request
    orderRequestDatabase.push({
      id: requestId,
      pharmacyId: Number.parseInt(userId),
      distributorId: Number.parseInt(distributorId),
      date: new Date().toISOString().split("T")[0],
      status: "Chờ phê duyệt",
      items: items,
    })

    // Reload pharmacy data
    loadPharmacyData(userId)

    // Clear form
    document.getElementById("request-distributor").value = ""
    document.getElementById("request-items").innerHTML = `
      <div class="request-item">
        <div class="field">
          <label class="label">Mã thuốc</label>
          <div class="control">
            <div class="select is-fullwidth">
              <select class="request-medicine-select" onchange="updateLogIdOptions(this)">
                <option value="">--Chọn thuốc--</option>
                <option value="MED001">Paracetamol 500mg</option>
                <option value="MED002">Amoxicillin 500mg</option>
                <option value="MED003">Omeprazole 20mg</option>
              </select>
            </div>
          </div>
        </div>
        <div class="field">
          <label class="label">Mã ghi nhận</label>
          <div class="control">
            <div class="select is-fullwidth">
              <select class="request-logid">
                <option value="">--Chọn mã ghi nhận--</option>
              </select>
            </div>
          </div>
        </div>
        <div class="field">
          <label class="label">Số lượng</label>
          <div class="control">
            <input class="input request-quantity" type="number" min="1" placeholder="Nhập số lượng">
          </div>
        </div>
      </div>
    `

    alert("Tạo yêu cầu nhập thuốc thành công")
  })

  // Process order button
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("process-order")) {
      const orderId = event.target.getAttribute("data-order")
      processOrder(orderId, userId)
    }
  })

  // Add item to request button
  document.getElementById("add-item-to-request").addEventListener("click", () => {
    const requestItems = document.getElementById("request-items")

    const newItem = document.createElement("div")
    newItem.className = "request-item"
    newItem.innerHTML = `
      <div class="field">
          <label class="label">Mã thuốc</label>
          <div class="control">
              <input class="input" id="request-medicine" type="text" placeholder="Nhập mã thuốc">
          </div>
      </div>
      <div class="field">
          <label class="label">Số lượng</label>
          <div class="control">
              <input class="input" id="request-quantity" type="number" min="1" placeholder="Nhập số lượng">
          </div>
      </div>
      <div class="field">
        <div class="control">
          <button class="button is-danger remove-item">Xóa</button>
        </div>
      </div>
      <hr>
    `

    requestItems.appendChild(newItem)

    // Add remove button event listener
    newItem.querySelector(".remove-item").addEventListener("click", () => {
      requestItems.removeChild(newItem)
    })

    // Add change event listener for medicine select
    newItem.querySelector(".request-medicine-select").addEventListener("change", function () {
      updateLogIdOptions(this)
    })
  })

  // Initialize updateLogIdOptions function
  window.updateLogIdOptions = (selectElement) => {
    const medicineId = selectElement.value
    const logIdSelect = selectElement.closest(".request-item").querySelector(".request-logid")

    // Clear existing options
    logIdSelect.innerHTML = '<option value="">--Chọn mã ghi nhận--</option>'

    if (medicineId) {
      // Get all batches of this medicine
      const batches = getMedicinesByMedicineId(medicineId)

      batches.forEach((medicine) => {
        const option = document.createElement("option")
        option.value = medicine.logId
        option.textContent = `${medicine.logId} (Lô: ${medicine.batch})`
        logIdSelect.appendChild(option)
      })
    }
  }

  // Initialize all medicine selects
  document.querySelectorAll(".request-medicine-select").forEach((select) => {
    select.addEventListener("change", function () {
      updateLogIdOptions(this)
    })
  })
}

// Update loadDoctorData function to work with log IDs
function loadDoctorData(userId) {
  // Load doctor prescriptions
  const doctorPrescriptions = document.getElementById("doctor-prescriptions")
  doctorPrescriptions.innerHTML = ""

  // Filter prescriptions by doctor
  const filteredPrescriptions = prescriptionDatabase.filter((prescription) => prescription.doctorId == userId)

  filteredPrescriptions.forEach((prescription) => {
    const patient = getUserById("5", prescription.patientId)
    const patientName = patient ? patient.name : "Không xác định"

    const tr = document.createElement("tr")
    tr.innerHTML = `
            <td>${prescription.id}</td>
            <td>${patientName}</td>
            <td>${formatDate(prescription.date)}</td>
            <td>${prescription.status}</td>
            <td>
                <button class="button is-small is-info view-prescription" data-prescription="${prescription.id}">Xem</button>
            </td>
        `
    doctorPrescriptions.appendChild(tr)
  })

  // Load orders needing doctor approval
  const doctorOrders = document.getElementById("doctor-orders")
  doctorOrders.innerHTML = ""

  // Filter orders by doctor and approval status
  const filteredOrders = orderDatabase.filter((order) => {
    const prescription = getPrescriptionById(order.prescriptionId)
    return prescription && prescription.doctorId == userId && !order.doctorApproval
  })

  filteredOrders.forEach((order) => {
    const patient = getUserById("5", order.patientId)
    const patientName = patient ? patient.name : "Không xác định"

    const pharmacy = getUserById("3", order.pharmacyId)
    const pharmacyName = pharmacy ? pharmacy.name : "Không xác định"

    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td>${order.id}</td>
      <td>${patientName}</td>
      <td>${pharmacyName}</td>
      <td>${formatDate(order.date)}</td>
      <td>
        <button class="button is-small is-info view-order" data-order="${order.id}">Xem</button>
        <button class="button is-small is-success approve-order" data-order="${order.id}">Phê duyệt</button>
      </td>
    `
    doctorOrders.appendChild(tr)
  })
}

// Update setupDoctorEventListeners function to work with log IDs
function setupDoctorEventListeners(userId) {
  // Add medicine to prescription button
  document.getElementById("add-medicine-to-prescription").addEventListener("click", () => {
    const prescriptionMedicines = document.getElementById("prescription-medicines")

    const newMedicine = document.createElement("div")
    newMedicine.className = "prescription-medicine"
    newMedicine.innerHTML = `
            <div class="field">
                <label class="label">Thuốc</label>
                <div class="control">
                    <div class="select is-fullwidth">
                        <select class="prescription-medicine-select" onchange="updatePrescriptionLogIdOptions(this)">
                            <option value="">--Chọn thuốc--</option>
                            <option value="MED001">Paracetamol 500mg</option>
                            <option value="MED002">Amoxicillin 500mg</option>
                            <option value="MED003">Omeprazole 20mg</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="field">
                <label class="label">Mã ghi nhận</label>
                <div class="control">
                    <div class="select is-fullwidth">
                        <select class="prescription-logid">
                            <option value="">--Chọn mã ghi nhận--</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="field">
                <label class="label">Liều dùng</label>
                <div class="control">
                    <input class="input prescription-dosage" type="text" placeholder="VD: 1 viên x 3 lần/ngày">
                </div>
            </div>
            <div class="field">
                <label class="label">Thời gian dùng</label>
                <div class="control">
                    <input class="input prescription-duration" type="text" placeholder="VD: 5 ngày">
                </div>
            </div>
            <div class="field">
                <div class="control">
                    <button class="button is-danger remove-medicine">Xóa</button>
                </div>
            </div>
            <hr>
        `

    prescriptionMedicines.appendChild(newMedicine)

    // Add remove button event listener
    newMedicine.querySelector(".remove-medicine").addEventListener("click", () => {
      prescriptionMedicines.removeChild(newMedicine)
    })

    // Add change event listener for medicine select
    newMedicine.querySelector(".prescription-medicine-select").addEventListener("change", function () {
      updatePrescriptionLogIdOptions(this)
    })
  })

  // Initialize updatePrescriptionLogIdOptions function
  window.updatePrescriptionLogIdOptions = (selectElement) => {
    const medicineId = selectElement.value
    const logIdSelect = selectElement.closest(".prescription-medicine").querySelector(".prescription-logid")

    // Clear existing options
    logIdSelect.innerHTML = '<option value="">--Chọn mã ghi nhận--</option>'

    if (medicineId) {
      // Get all batches of this medicine
      const batches = getMedicinesByMedicineId(medicineId)

      batches.forEach((medicine) => {
        const option = document.createElement("option")
        option.value = medicine.logId
        option.textContent = `${medicine.logId} (Lô: ${medicine.batch})`
        logIdSelect.appendChild(option)
      })
    }
  }

  // Initialize all medicine selects
  document.querySelectorAll(".prescription-medicine-select").forEach((select) => {
    select.addEventListener("change", function () {
      updatePrescriptionLogIdOptions(this)
    })
  })

  // Create prescription button
  document.getElementById("create-prescription-button").addEventListener("click", () => {
    const patientId = document.getElementById("prescription-patient").value
    const notes = document.getElementById("prescription-notes").value

    if (!patientId) {
      alert("Vui lòng chọn bệnh nhân")
      return
    }

    // Get medicines
    const medicineElements = document.querySelectorAll(".prescription-medicine")
    const medicines = []

    let isValid = true

    medicineElements.forEach((element) => {
      const medicineId = element.querySelector(".prescription-medicine-select").value
      const logId = element.querySelector(".prescription-logid").value
      const dosage = element.querySelector(".prescription-dosage").value.trim()
      const duration = element.querySelector(".prescription-duration").value.trim()

      if (!medicineId || !logId || !dosage || !duration) {
        isValid = false
        return
      }

      medicines.push({
        medicineId: medicineId,
        logId: logId,
        dosage: dosage,
        duration: duration,
      })
    })

    if (!isValid || medicines.length === 0) {
      alert("Vui lòng điền đầy đủ thông tin thuốc")
      return
    }

    // Generate prescription ID
    const prescriptionId = `PRES${prescriptionDatabase.length + 1}`.padStart(7, "0")

    // Add new prescription with doctor approval
    prescriptionDatabase.push({
      id: prescriptionId,
      doctorId: Number.parseInt(userId),
      patientId: Number.parseInt(patientId),
      date: new Date().toISOString().split("T")[0],
      medicines: medicines,
      status: "Đã phê duyệt bởi bác sĩ",
      patientApproval: false,
      notes: notes,
    })

    // Reload doctor data
    loadDoctorData(userId)

    // Clear form
    document.getElementById("prescription-patient").value = ""
    document.getElementById("prescription-notes").value = ""
    document.getElementById("prescription-medicines").innerHTML = `
            <div class="prescription-medicine">
                <div class="field">
                    <label class="label">Thuốc</label>
                    <div class="control">
                        <div class="select is-fullwidth">
                            <select class="prescription-medicine-select" onchange="updatePrescriptionLogIdOptions(this)">
                                <option value="">--Chọn thuốc--</option>
                                <option value="MED001">Paracetamol 500mg</option>
                                <option value="MED002">Amoxicillin 500mg</option>
                                <option value="MED003">Omeprazole 20mg</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="field">
                    <label class="label">Mã ghi nhận</label>
                    <div class="control">
                        <div class="select is-fullwidth">
                            <select class="prescription-logid">
                                <option value="">--Chọn mã ghi nhận--</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="field">
                    <label class="label">Liều dùng</label>
                    <div class="control">
                        <input class="input prescription-dosage" type="text" placeholder="VD: 1 viên x 3 lần/ngày">
                    </div>
                </div>
                <div class="field">
                    <label class="label">Thời gian dùng</label>
                    <div class="control">
                        <input class="input prescription-duration" type="text" placeholder="VD: 5 ngày">
                    </div>
                </div>
            </div>
        `

    alert("Tạo đơn thuốc thành công")
  })

  // Approve order button
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("approve-order")) {
      const orderId = event.target.getAttribute("data-order")
      approveOrderByDoctor(orderId)
    }
  })
}

// Add function to approve order by doctor
function approveOrderByDoctor(orderId) {
  const order = getOrderById(orderId)

  if (!order) {
    alert("Không tìm thấy đơn hàng")
    return
  }

  // Update order approval
  order.doctorApproval = true

  // Update order status if both approvals are present
  if (order.patientApproval) {
    order.status = "Chờ xử lý"
  }

  alert("Phê duyệt đơn hàng thành công")

  // Reload data
  loadDoctorData(order.doctorId)
}

// Update loadPatientData function to work with log IDs
function loadPatientData(userId) {
  // Load patient prescriptions
  const patientPrescriptions = document.getElementById("patient-prescriptions")
  patientPrescriptions.innerHTML = ""

  // Filter prescriptions by patient
  const filteredPrescriptions = prescriptionDatabase.filter((prescription) => prescription.patientId == userId)

  filteredPrescriptions.forEach((prescription) => {
    const doctor = getUserById("4", prescription.doctorId)
    const doctorName = doctor ? doctor.name : "Không xác định"

    const tr = document.createElement("tr")
    tr.innerHTML = `
            <td>${prescription.id}</td>
            <td>${doctorName}</td>
            <td>${formatDate(prescription.date)}</td>
            <td>${prescription.status}</td>
            <td>
                <button class="button is-small is-info view-prescription" data-prescription="${prescription.id}">Xem</button>
                ${
                  !prescription.patientApproval
                    ? `<button class="button is-small is-success approve-prescription" data-prescription="${prescription.id}">Phê duyệt</button>`
                    : ""
                }
            </td>
        `
    patientPrescriptions.appendChild(tr)
  })

  // Load patient orders
  const patientOrders = document.getElementById("patient-orders")
  patientOrders.innerHTML = ""

  // Filter orders by patient
  const filteredOrders = orderDatabase.filter((order) => order.patientId == userId)

  filteredOrders.forEach((order) => {
    const pharmacy = getUserById("3", order.pharmacyId)
    const pharmacyName = pharmacy ? pharmacy.name : "Không xác định"

    const tr = document.createElement("tr")
    tr.innerHTML = `
            <td>${order.id}</td>
            <td>${pharmacyName}</td>
            <td>${formatDate(order.date)}</td>
            <td>${order.status}</td>
            <td>
                <button class="button is-small is-info view-order" data-order="${order.id}">Xem</button>
            </td>
        `
    patientOrders.appendChild(tr)
  })

  // Populate prescription select for new order
  const orderPrescriptionSelect = document.getElementById("order-prescription")
  orderPrescriptionSelect.innerHTML = '<option value="">--Chọn đơn thuốc--</option>'

  // Only show approved prescriptions
  const approvedPrescriptions = filteredPrescriptions.filter((prescription) => prescription.patientApproval)

  approvedPrescriptions.forEach((prescription) => {
    const option = document.createElement("option")
    option.value = prescription.id
    option.textContent = `${prescription.id} - ${formatDate(prescription.date)}`
    orderPrescriptionSelect.appendChild(option)
  })
}

// Update setupPatientEventListeners function to work with log IDs
function setupPatientEventListeners(userId) {
  // Create order button
  document.getElementById("create-order-button").addEventListener("click", () => {
    const prescriptionId = document.getElementById("order-prescription").value
    const pharmacyId = document.getElementById("order-pharmacy").value

    if (!prescriptionId || !pharmacyId) {
      alert("Vui lòng chọn đơn thuốc và nhà thuốc")
      return
    }

    // Get prescription
    const prescription = getPrescriptionById(prescriptionId)

    if (!prescription) {
      alert("Không tìm thấy đơn thuốc")
      return
    }

    // Check if prescription is approved by patient
    if (!prescription.patientApproval) {
      alert("Vui lòng phê duyệt đơn thuốc trước khi đặt hàng")
      return
    }

    // Generate order ID
    const orderId = `ORD${orderDatabase.length + 1}`.padStart(6, "0")

    // Create order items from prescription
    const items = prescription.medicines.map((medicine) => {
      // Calculate quantity based on dosage and duration
      let quantity = 0

      // Simple parsing of dosage and duration
      const dosageParts = medicine.dosage.split("x")
      const durationParts = medicine.duration.split(" ")

      if (dosageParts.length > 1 && durationParts.length > 0) {
        const dosagePerDay = Number.parseInt(dosageParts[1])
        const days = Number.parseInt(durationParts[0])

        if (!isNaN(dosagePerDay) && !isNaN(days)) {
          quantity = dosagePerDay * days
        } else {
          quantity = 10 // Default if parsing fails
        }
      } else {
        quantity = 10 // Default
      }

      return {
        medicineId: medicine.medicineId,
        logId: medicine.logId,
        quantity: quantity,
      }
    })

    // Add new order with patient approval
    orderDatabase.push({
      id: orderId,
      patientId: Number.parseInt(userId),
      pharmacyId: Number.parseInt(pharmacyId),
      prescriptionId: prescriptionId,
      doctorId: prescription.doctorId,
      date: new Date().toISOString().split("T")[0],
      status: "Chờ phê duyệt",
      doctorApproval: false,
      patientApproval: true,
      items: items,
    })

    // Reload patient data
    loadPatientData(userId)

    // Clear form
    document.getElementById("order-prescription").value = ""
    document.getElementById("order-pharmacy").value = ""

    alert("Đặt hàng thành công, đang chờ phê duyệt từ bác sĩ")
  })

  // Approve prescription button
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("approve-prescription")) {
      const prescriptionId = event.target.getAttribute("data-prescription")
      approvePrescriptionByPatient(prescriptionId)
    }
  })
}

// Add function to approve prescription by patient
function approvePrescriptionByPatient(prescriptionId) {
  const prescription = getPrescriptionById(prescriptionId)

  if (!prescription) {
    alert("Không tìm thấy đơn thuốc")
    return
  }

  // Update prescription approval
  prescription.patientApproval = true
  prescription.status = "Đã phê duyệt bởi bác sĩ và bệnh nhân"

  alert("Phê duyệt đơn thuốc thành công")

  // Reload data
  loadPatientData(prescription.patientId)
}

// Update processOrder function to work with log IDs
function processOrder(orderId, pharmacyId) {
  const order = getOrderById(orderId)

  if (!order) {
    alert("Không tìm thấy đơn hàng")
    return
  }

  // Check if order has both doctor and patient approval
  if (!order.doctorApproval || !order.patientApproval) {
    alert("Đơn hàng cần được phê duyệt bởi cả bác sĩ và bệnh nhân")
    return
  }

  // Check pharmacy inventory
  const inventory = inventoryDatabase[pharmacyId] || []
  let canFulfill = true

  order.items.forEach((item) => {
    const inventoryItem = inventory.find((invItem) => invItem.logId === item.logId)
    if (!inventoryItem || inventoryItem.quantity < item.quantity) {
      canFulfill = false
    }
  })

  if (!canFulfill) {
    alert("Số lượng thuốc trong kho không đủ để đáp ứng đơn hàng")
    return
  }

  // Update order status
  order.status = "Đã xử lý"

  // Update inventory
  order.items.forEach((item) => {
    const inventoryItem = inventory.find((invItem) => invItem.logId === item.logId)
    if (inventoryItem) {
      inventoryItem.quantity -= item.quantity
    }

    // Update medicine history
    const medicine = getMedicineByLogId(item.logId)
    const pharmacy = getUserById("3", pharmacyId)
    const pharmacyName = pharmacy ? pharmacy.name : "Không xác định"
    const patient = getUserById("5", order.patientId)
    const patientName = patient ? patient.name : "Không xác định"

    if (medicine) {
      medicine.history.push({
        date: new Date().toISOString().split("T")[0],
        entity: pharmacyName,
        action: `Xuất thuốc cho bệnh nhân ${patientName}`,
        logId: medicine.logId,
      })

      medicine.history.push({
        date: new Date().toISOString().split("T")[0],
        entity: patientName,
        action: "Nhận thuốc",
        logId: medicine.logId,
      })
    }
  })

  // Reload pharmacy data
  loadPharmacyData(pharmacyId)

  alert("Xử lý đơn hàng thành công")
}

// Update viewOrder function to work with log IDs
function viewOrder(orderId) {
  const order = getOrderById(orderId)

  if (!order) {
    alert("Không tìm thấy đơn hàng")
    return
  }

  // Get patient and pharmacy info
  const patient = getUserById("5", order.patientId)
  const patientName = patient ? patient.name : "Không xác định"

  const pharmacy = getUserById("3", order.pharmacyId)
  const pharmacyName = pharmacy ? pharmacy.name : "Không xác định"

  // Set modal content
  document.getElementById("modal-order-id").textContent = order.id
  document.getElementById("modal-order-patient").textContent = patientName
  document.getElementById("modal-order-pharmacy").textContent = pharmacyName
  document.getElementById("modal-order-date").textContent = formatDate(order.date)
  document.getElementById("modal-order-status").textContent = order.status
  document.getElementById("modal-order-doctor-approval").textContent = order.doctorApproval
    ? "Đã phê duyệt"
    : "Chưa phê duyệt"
  document.getElementById("modal-order-patient-approval").textContent = order.patientApproval
    ? "Đã phê duyệt"
    : "Chưa phê duyệt"

  // Set items
  const itemsTable = document.getElementById("modal-order-items")
  itemsTable.innerHTML = ""

  order.items.forEach((item) => {
    const medicineInfo = getMedicineByLogId(item.logId)
    const medicineName = medicineInfo ? medicineInfo.name : item.medicineId
    const logId = medicineInfo ? medicineInfo.logId : "N/A"

    const tr = document.createElement("tr")
    tr.innerHTML = `
            <td>${medicineName}</td>
            <td>${item.quantity}</td>
            <td>${logId}</td>
        `
    itemsTable.appendChild(tr)
  })

  // Show modal
  document.getElementById("view-order-modal").classList.add("is-active")
}

// Update viewPrescription function to work with log IDs
function viewPrescription(prescriptionId) {
  const prescription = getPrescriptionById(prescriptionId)

  if (!prescription) {
    alert("Không tìm thấy đơn thuốc")
    return
  }

  // Set prescription info
  document.getElementById("modal-prescription-id").textContent = prescription.id
  const doctor = getUserById("4", prescription.doctorId)
  document.getElementById("modal-prescription-doctor").textContent = doctor ? doctor.name : "Không xác định"
  const patient = getUserById("5", prescription.patientId)
  document.getElementById("modal-prescription-patient").textContent = patient ? patient.name : "Không xác định"
  document.getElementById("modal-prescription-date").textContent = formatDate(prescription.date)
  document.getElementById("modal-prescription-status").textContent = prescription.status

  // Set prescription medicines
  const medicinesList = document.getElementById("modal-prescription-medicines")
  medicinesList.innerHTML = ""

  prescription.medicines.forEach((medicine) => {
    const medicineInfo = getMedicineByLogId(medicine.logId)
    const medicineName = medicineInfo ? medicineInfo.name : medicine.medicineId

    const tr = document.createElement("tr")
    tr.innerHTML = `
            <td>${medicineName} (${medicine.logId})</td>
            <td>${medicine.dosage}</td>
            <td>${medicine.duration}</td>
        `
    medicinesList.appendChild(tr)
  })

  // Show prescription modal
  document.getElementById("modal-prescription-modal").classList.add("is-active")
}

// Update viewRequest function to work with log IDs
function viewRequest(requestId) {
  const request = orderRequestDatabase.find((req) => req.id === requestId)

  if (!request) {
    alert("Không tìm thấy yêu cầu")
    return
  }

  // Set request info
  document.getElementById("modal-request-id").textContent = request.id
  const pharmacy = getUserById("3", request.pharmacyId)
  document.getElementById("modal-request-pharmacy").textContent = pharmacy ? pharmacy.name : "Không xác định"
  const distributor = getUserById("2", request.distributorId)
  document.getElementById("modal-request-distributor").textContent = distributor ? distributor.name : "Không xác định"
  document.getElementById("modal-request-date").textContent = formatDate(request.date)
  document.getElementById("modal-request-status").textContent = request.status

  // Set request items
  const itemsTable = document.getElementById("modal-request-items")
  itemsTable.innerHTML = ""

  request.items.forEach((item) => {
    const medicineInfo = getMedicineByLogId(item.logId)
    const medicineName = medicineInfo ? medicineInfo.name : "Không xác định"

    const tr = document.createElement("tr")
    tr.innerHTML = `
            <td>${medicineName} (${item.logId})</td>
            <td>${item.quantity}</td>
        `
    itemsTable.appendChild(tr)
  })

  // Show request modal
  document.getElementById("modal-request-modal").classList.add("is-active")
}

// Update loadMedicinesData function to display all medicine batches
function loadMedicinesData() {
  // Load medicines list
  const medicinesList = document.getElementById("medicines-list")
  medicinesList.innerHTML = ""

  Object.entries(medicineDatabase).forEach(([Id, medicine]) => {
    const tr = document.createElement("tr")
    tr.innerHTML = `
            <td>${Id}</td>
            <td>${medicine.name}</td>
            <td>${formatDate(medicine.expiryDate)}</td>
        `
    medicinesList.appendChild(tr)
  })
}

function setupEventListeners(roleId, userId) {
  // Navbar burger menu for mobile
  const navbarBurger = document.querySelector(".navbar-burger")
  if (navbarBurger) {
    navbarBurger.addEventListener("click", function () {
      const target = document.getElementById(this.dataset.target)
      this.classList.toggle("is-active")
      target.classList.toggle("is-active")
    })
  }

  // View prescription buttons
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("view-prescription")) {
      const prescriptionId = event.target.getAttribute("data-prescription")
      viewPrescription(prescriptionId)
    }
  })

  // View order buttons
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("view-order")) {
      const orderId = event.target.getAttribute("data-order")
      viewOrder(orderId)
    }
  })

  // View request buttons
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("view-request")) {
      const requestId = event.target.getAttribute("data-request")
      viewRequest(requestId)
    }
  })

  // Track medicine buttons
  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("track-medicine")) {
      const logId = event.target.getAttribute("data-logid")
      trackMedicine(logId)
    }
  })

  // Close prescription modal
  document.getElementById("close-prescription-modal").addEventListener("click", () => {
    document.getElementById("view-prescription-modal").classList.remove("is-active")
  })

  // Close order modal
  document.getElementById("close-order-modal").addEventListener("click", () => {
    document.getElementById("view-order-modal").classList.remove("is-active")
  })

  // Close request modal
  document.getElementById("close-request-modal").addEventListener("click", () => {
    document.getElementById("view-request-modal").classList.remove("is-active")
  })

  // Track medicine button in tracking tab
  document.getElementById("track-medicine-button").addEventListener("click", () => {
    const logId = document.getElementById("track-medicine-code").value.trim()
    trackMedicine(logId)
  })

  // Search medicine button
  document.getElementById("search-medicine-button").addEventListener("click", () => {
    const searchTerm = document.getElementById("medicine-search").value.trim().toLowerCase()
    searchMedicines(searchTerm)
  })

  // Role-specific event listeners
  switch (roleId) {
    case "1": // Manufacturer
      setupManufacturerEventListeners(userId)
      break
    case "2": // Distributor
      setupDistributorEventListeners(userId)
      break
    case "3": // Pharmacy
      setupPharmacyEventListeners(userId)
      break
    case "4": // Doctor
      setupDoctorEventListeners(userId)
      break
    case "5": // Patient
      setupPatientEventListeners(userId)
      break
  }
}

// Update trackMedicine function to work with log IDs
async function trackMedicine(logId) {
  medicine = await getMedicineByLogId(logId)
  if (!medicine) {
    alert("Không tìm thấy thông tin thuốc")
    return
  }

  // Set tracking tab as active
  const tabContents = document.querySelectorAll(".tab-content")
  tabContents.forEach((content) => {
    content.classList.add("is-hidden")
  })

  document.getElementById("tracking").classList.remove("is-hidden")

  // Set medicine info
  const medicineInfo = getUserById("1", medicine[0].manufacturerId)
  document.getElementById("track-medicine-code").value = logId;
  document.getElementById("track-medicine-name").textContent =
    medicineDatabase[medicine[0].medicineId]?.name || 'Không rõ';
  document.getElementById("track-medicine-manufacturer").textContent =
    medicineInfo?.name || 'Không rõ NSX';
  document.getElementById("track-medicine-production-date").textContent =
    formatDate(medicine[0].productionDate);
  document.getElementById("track-medicine-expiry-date").textContent =
    formatDate(medicine[0].expiryDate);
  document.getElementById("track-medicine-batch").textContent =
    medicine[0].batchId;
  document.getElementById("track-medicine-logid").textContent =
    medicine[0].logId;

  const records = medicine.slice(1);
  const historyList = document.getElementById("track-distribution-history")
  historyList.innerHTML = ""

  if (records.length === 0) {
    const li = document.createElement("li")
    li.innerHTML = `<p class="has-text-grey">Không có lịch sử phân phối nào.</p>`
    historyList.appendChild(li)
  } else {
    records.forEach((item) => {
      const li = document.createElement("li")
      li.innerHTML = `
        <div class="timeline-item">
          <div class="timeline-marker is-primary"></div>
          <div class="timeline-content">
            <p class="heading">${formatDate(item.timestamp)}</p>
            <p>
              <strong>${item.fromId}</strong>
              đã chuyển <strong>${item.totalQuantity}</strong> đơn vị thuốc đến
              <strong>${item.toId}</strong>
            </p>
            <p class="is-size-7">Mã chuyển: ${item.logId}</p>
          </div>
        </div>
      `
      historyList.appendChild(li)
    })
  }

  document.getElementById("track-medicine-info").classList.remove("is-hidden")
}

// Add function to search medicines
function searchMedicines(searchTerm) {
  const medicinesList = document.getElementById("medicines-list")
  medicinesList.innerHTML = ""

  Object.entries(medicineDatabase).forEach(([logId, medicine]) => {
    // Search by medicine ID, name, manufacturer, batch, or log ID
    if (
      medicine.medicineId.toLowerCase().includes(searchTerm) ||
      medicine.name.toLowerCase().includes(searchTerm) ||
      medicine.manufacturer.toLowerCase().includes(searchTerm) ||
      medicine.batch.toLowerCase().includes(searchTerm) ||
      medicine.logId.toLowerCase().includes(searchTerm)
    ) {
      const tr = document.createElement("tr")
      tr.innerHTML = `
                <td>${medicine.medicineId}</td>
                <td>${medicine.name}</td>
                <td>${medicine.manufacturer}</td>
                <td>${formatDate(medicine.expiryDate)}</td>
                <td>${medicine.logId}</td>
                <td>${medicine.batch}</td>
                <td>
                    <button class="button is-small is-info track-medicine" data-logid="${logId}">Tra cứu</button>
                </td>
            `
      medicinesList.appendChild(tr)
    }
  })
}
