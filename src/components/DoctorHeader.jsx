import { useNavigate } from 'react-router-dom'

function DoctorHeader({ currentUser, userRole, onLogout, children }) {
  const navigate = useNavigate()

  const menuItems = [
    { icon: '🏠', label: 'Dashboard', description: 'หน้าแรกสำหรับแพทย์', path: '/dashboard-doctor', active: window.location.pathname === '/dashboard-doctor' },
    { icon: '👥', label: 'ข้อมูลคนไข้', description: 'ดูข้อมูลคนไข้', path: '/doctor/patients', active: window.location.pathname === '/doctor/patients' },
    { icon: '📅', label: 'นัดหมาย', description: 'จัดการนัดหมายคนไข้', path: '/doctor/appointments' },
    { icon: '📋', label: 'ประวัติการรักษา', description: 'ดูประวัติการรักษา', path: '/doctor/records' },
    { icon: '💊', label: 'ใบสั่งยา', description: 'จัดการใบสั่งยา', path: '/doctor/prescriptions' },
    { icon: '📊', label: 'รายงาน', description: 'ดูรายงานทางการแพทย์', path: '/doctor/reports' }
  ]

  const handleMenuClick = (path) => {
    if (path) {
      navigate(path)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50">
      {/* Top Header */}
      <header className="bg-gradient-to-r from-emerald-600 to-green-600 shadow-lg border-b border-emerald-300/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center font-bold text-emerald-600 shadow-sm">
                👨‍⚕️
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Clinic Management</h1>
                <p className="text-xs text-emerald-100">Doctor Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 bg-white/20 text-white text-xs font-semibold rounded-full border border-white/30">
                {userRole}
              </span>
              <span className="text-sm text-emerald-100">👨‍⚕️ {currentUser?.email}</span>
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

      {/* Navigation Menu */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {menuItems.map((item, index) => (
              <button
                key={index}
                onClick={() => handleMenuClick(item.path)}
                className={`flex items-center gap-2 px-4 py-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  item.active
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <div className="text-left">
                  <div>{item.label}</div>
                  <div className="text-xs text-gray-400 font-normal">{item.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}

export default DoctorHeader