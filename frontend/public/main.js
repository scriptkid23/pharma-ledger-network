import { ip } from '../ip.js';

const userData = {
  1: [  
    // Manufacturers

  ],
  2: [
    // Distributors
    
  ],
  3: [
    // Pharmacies
    
  ],
  5: [
    // Patients
  ],
}
async function getData() {
  try {
    const nsx = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaSanXuat`).then(res => res.json());
    const npp = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaPhanPhoi`).then(res => res.json());
    const nt = await fetch(`http://${ip.host}:${ip.backend}/api/getNhaThuoc`).then(res => res.json());
    const bn = await fetch(`http://${ip.host}:${ip.backend}/api/getBenhNhan`).then(res => res.json());
    console.log(1)
    // Luôn giữ dạng MẢNG
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
    userData[5] = bn.map(item => ({
      id: item.SO_DIEN_THOAI,
      name: item.TEN_BENHNHAN
    }));

  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

getData()
console.log("User data loaded:", userData)
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

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString("vi-VN")
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = document.getElementById("role-select")
  const userSelect = document.getElementById("user-select")
  const loginButton = document.getElementById("login-button")
  const trackMedicineButton = document.getElementById("track-medicine-button")
  const trackingModal = document.getElementById("tracking-modal")
  const closeTrackingModal = document.getElementById("close-tracking-modal")
  const searchMedicineButton = document.getElementById("search-medicine")
  // Populate user select based on role selection
  roleSelect.addEventListener("change", function () {
    const roleId = this.value

    // Clear user select
    userSelect.innerHTML = '<option value="">--Chọn người dùng--</option>'

    if (roleId == 5) {
      userData[roleId].forEach((user) => {
        const option = document.createElement("option")
        option.value = user.id
        option.textContent = `${user.id}, ${user.name}`
        userSelect.appendChild(option)
      })
    }

    else if (userData[roleId]) {
      userData[roleId].forEach((user) => {
        const option = document.createElement("option")
        option.value = user.id
        option.textContent = user.name
        userSelect.appendChild(option)
      })
    }
  })

  // Login form submission
  loginButton.addEventListener("click", (event) => {
    event.preventDefault()

    const roleId = roleSelect.value
    const userId = userSelect.value

    if (roleId === "0" || !userId) {
      alert("Vui lòng chọn vai trò và người dùng")
      return
    }

    // Define role paths
    const rolePaths = {
      1: "manufacturer",
      2: "distributor",
      3: "pharmacy",
      5: "patient",
    };

    const rolePath = rolePaths[roleId];

    if (rolePath) {
      // Redirect to the role-specific dashboard
      window.location.href = `${rolePath}/index.html?role=${roleId}&userId=${userId}`;
    } else {
      alert("Vai trò không hợp lệ"); // Handle invalid role case
    }
  })

  // Track medicine button
  trackMedicineButton.addEventListener("click", () => {
    trackingModal.classList.add("is-active")
  })

  // Close tracking modal
  closeTrackingModal.addEventListener("click", () => {
    trackingModal.classList.remove("is-active")
  })

  // Update the search medicine function to display log ID
  searchMedicineButton.addEventListener("click", async () => {
    const medicineCode = document.getElementById("medicine-code").value.trim()
    const medicineInfo = document.getElementById("medicine-info")

    // First try to find by log ID
    let medicine = await getMedicineByLogId(medicineCode)

    if (!medicine) {
      alert("Không tìm thấy thông tin thuốc")
      medicineInfo.classList.add("is-hidden")
      return
    }

    // Display medicine info
    document.getElementById("medicine-name").textContent = medicine[0].name
    document.getElementById("medicine-manufacturer").textContent = medicine[0].manufacturerId
    document.getElementById("medicine-production-date").textContent = medicine[0].productionDate
    document.getElementById("medicine-expiry-date").textContent = medicine[0].expiryDate
    document.getElementById("medicine-batch").textContent = medicine[0].batchId
    document.getElementById("medicine-logid").textContent = medicine[0].logId

    // Add log ID display
    if (!document.getElementById("medicine-logid-container")) {
      const logIdContainer = document.createElement("p")
      logIdContainer.id = "medicine-logid-container"
      logIdContainer.innerHTML = `<strong>Mã ghi nhận:</strong> <span id="medicine-logid"></span>`
      document.querySelector("#medicine-info .box").appendChild(logIdContainer)
    }
    document.getElementById("medicine-logid").textContent = medicine.logId

    // Display distribution history
    const records = medicine.slice(1);
    const historyList = document.getElementById("distribution-history")
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
    medicineInfo.classList.remove("is-hidden")
  })
})
