import { useNavigate } from 'react-router-dom'

function AdminHeader({ currentUser, userRole, onLogout, children }) {
  const navigate = useNavigate()

  const menuItems = [
    { icon: '🏠', label: 'Dashboard', description: 'ข้อมูลรวมและรายงาน', path: '/dashboard-admin', active: window.location.pathname === '/dashboard-admin' },
    { icon: '👥', label: 'Patients', description: 'จัดการข้อมูลคนไข้', path: '/admin/patients', active: window.location.pathname === '/admin/patients' },
    { icon: '📅', label: 'Appointments', description: 'จัดการนัดหมาย', path: '/admin/appointments', active: window.location.pathname === '/admin/appointments' },
    { icon: '🏥', label: 'Clinic / Queue', description: 'จัดการคิวคลินิก', path: '/admin/queue', active: window.location.pathname === '/admin/queue' },
    { icon: '⚙️', label: 'ตั้งค่าคลินิก', description: 'เวลาทำการ ตารางเวร คิว', path: '/admin/settings', active: window.location.pathname === '/admin/settings' },
    { icon: '👤', label: 'จัดการผู้ใช้', description: 'เพิ่ม/ลบ ผู้ใช้ในระบบ', path: '/admin/users', active: window.location.pathname === '/admin/users' },
    { icon: '💊', label: 'Pharmacy', description: 'จัดการยาและเภสัชกรรม', path: '/admin/pharmacy', active: window.location.pathname === '/admin/pharmacy' },
    { icon: '🧾', label: 'Billing', description: 'รายได้/ลบบิล/ค่าตอบแทนแพทย์', path: '/admin/billing', active: window.location.pathname === '/admin/billing' },
    { icon: '📋', label: 'ประวัติการรักษา', description: 'ดูและแก้ไขประวัติ', path: '/admin/records', active: window.location.pathname === '/admin/records' }
  ]

  const handleMenuClick = (path) => {
    if (path) {
      navigate(path)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Top Header */}
      <header className="bg-gradient-to-r from-slate-800 to-slate-700 shadow-lg border-b border-teal-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center font-bold text-white">A</div>
              <div>
                <h1 className="text-xl font-bold text-white">Clinic Management</h1>
                <p className="text-xs text-teal-300">Admin Control Panel</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 bg-teal-500/20 text-teal-200 text-xs font-semibold rounded-full border border-teal-500/40">
                {userRole}
              </span>
              <span className="text-sm text-gray-300">🔐 {currentUser?.email}</span>
              <button
                onClick={onLogout}
                className="px-4 py-2 bg-red-500/90 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {children}
          </div>

          {/* Sidebar Navigation - Right Side */}
          <div className="lg:col-span-1">
            <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-6 sticky top-8">
              <h2 className="text-lg font-bold text-slate-900 mb-1">⚡ Control Panel</h2>
              <p className="text-xs text-gray-500 mb-5">ระบบจัดการ</p>
              <nav className="space-y-2">
                {menuItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleMenuClick(item.path)}
                    className={`w-full text-left p-3 rounded-xl transition-all duration-200 ${item.active
                        ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{item.icon}</span>
                      <div>
                        <div className="font-semibold text-sm">{item.label}</div>
                        <div className={`text-xs ${item.active ? 'text-teal-100' : 'text-gray-500'}`}>{item.description}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminHeader