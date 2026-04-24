import { useNavigate } from 'react-router-dom'

function StaffHeader({ currentUser, userRole, onLogout, children }) {
  const navigate = useNavigate()

  const menuItems = [
    { icon: '🏠', label: 'Dashboard', description: 'หน้าแรกสำหรับจัดการงานประจำวัน', path: '/dashboard-staff', active: window.location.pathname === '/dashboard-staff' },
    { icon: '👥', label: 'Patients', description: 'จัดการข้อมูลคนไข้', path: '/staff/patients', active: window.location.pathname === '/staff/patients' },
    { icon: '📅', label: 'Appointments', description: 'จัดการนัดหมาย', path: '/staff/appointments', active: window.location.pathname === '/staff/appointments' },
    { icon: '🏥', label: 'Clinic / Queue', description: 'จัดการคิวคลินิก', path: '/clinic-queue', active: window.location.pathname === '/clinic-queue' },
    { icon: '💊', label: 'Pharmacy', description: 'จัดการยาและเภสัชกรรม', path: '/pharmacy', active: window.location.pathname === '/pharmacy' },
    { icon: '🧾', label: 'POS & Billing', description: 'ระบบขายและเรียกเก็บเงิน', path: '/pos-billing', active: window.location.pathname === '/pos-billing' },
    { icon: '📋', label: 'ประวัติการรักษา', description: 'ดูประวัติและค่าใช้จ่าย (Read-only)', path: '/staff/records', active: window.location.pathname === '/staff/records' }
  ]

  const handleMenuClick = (path) => {
    if (path) {
      navigate(path)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Top Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Clinic Management System</h1>
              <span className="ml-4 px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                Role: {userRole}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">ยินดีต้อนรับ, {currentUser?.email}</span>
              <button
                onClick={onLogout}
                className="px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition-colors"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 print:block print:gap-0">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1 print:hidden">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">เมนูหลัก</h2>
              <nav className="space-y-2">
                {menuItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleMenuClick(item.path)}
                    className={`w-full text-left p-3 rounded-xl transition-all ${
                      item.active
                        ? 'bg-blue-50 border border-blue-200 text-blue-700'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{item.icon}</span>
                      <div>
                        <div className="font-medium">{item.label}</div>
                        <div className="text-xs text-gray-500">{item.description}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export default StaffHeader