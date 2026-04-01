import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import StaffHeader from '../components/StaffHeader'

function DashboardStaff() {
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
    <StaffHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {/* ── Logout notification toast ─── */}
      {logoutMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {logoutMsg}
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Staff Dashboard</h1>
          <p className="text-gray-500 mt-1">หน้าแรกสำหรับจัดการงานประจำวัน</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-100">
            <h3 className="text-emerald-800 font-bold mb-2">ลงทะเบียนคนไข้</h3>
            <p className="text-emerald-600 text-sm">รับคนไข้ใหม่และจองคิวตรวจ</p>
          </div>
          <div className="p-6 bg-blue-50 rounded-xl border border-blue-100">
            <h3 className="text-blue-800 font-bold mb-2">จัดการนัดหมาย</h3>
            <p className="text-blue-600 text-sm">ดูตารางการนัดหมายแพทย์</p>
          </div>
          <div className="p-6 bg-purple-50 rounded-xl border border-purple-100">
            <h3 className="text-purple-800 font-bold mb-2">ระบบคลังยา</h3>
            <p className="text-purple-600 text-sm">เช็คสต็อกยาและเวชภัณฑ์</p>
          </div>
        </div>
      </div>
    </StaffHeader>
  )
}

export default DashboardStaff
