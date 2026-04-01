import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import AdminHeader from '../components/AdminHeader'

function DashboardAdmin() {
  const { logout, currentUser, userRole } = useAuth()
  const navigate = useNavigate()
  const [logoutMsg, setLogoutMsg] = useState('')

  const handleLogout = async () => {
    try {
      setLogoutMsg('กำลังออกจากระบบ...')
      await logout()
      setLogoutMsg('ออกจากระบบสำเร็จ')
      setTimeout(() => {
        navigate('/')
      }, 800)
    } catch (err) {
      console.error('Logout failed:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
      setLogoutMsg('')
    }
  }

  return (
    <AdminHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {/* ── Logout notification toast ─── */}
      {logoutMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-teal-500/20 border border-teal-500/50 text-teal-100 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {logoutMsg}
        </div>
      )}
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-teal-600 bg-clip-text text-transparent">⚙️ Admin Dashboard</h1>
          <p className="text-gray-600 mt-2 font-medium">ศูนย์ควบคุมและจัดการระบบคลินิก</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl border border-teal-200 hover:shadow-lg transition-shadow">
            <div className="text-3xl mb-3">👥</div>
            <h3 className="text-teal-900 font-bold mb-2">จัดการผู้ใช้</h3>
            <p className="text-teal-700 text-sm">เพิ่ม/ลบ ข้อมูลเจ้าหน้าที่ในระบบ</p>
          </div>
          <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 hover:shadow-lg transition-shadow">
            <div className="text-3xl mb-3">📊</div>
            <h3 className="text-blue-900 font-bold mb-2">รายงานและการวิเคราะห์</h3>
            <p className="text-blue-700 text-sm">ดูสถิติการใช้งานและรายได้ของคลินิก</p>
          </div>
          <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 hover:shadow-lg transition-shadow">
            <div className="text-3xl mb-3">🔧</div>
            <h3 className="text-purple-900 font-bold mb-2">ตั้งค่าระบบ</h3>
            <p className="text-purple-700 text-sm">จัดการข้อมูลคลินิก สาขา และค่าตั้งต่างๆ</p>
          </div>
        </div>
      </div>
    </AdminHeader>
  )
}

export default DashboardAdmin
