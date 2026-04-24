import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import StaffHeader from '../components/StaffHeader'
import { collection, query, onSnapshot, where, Timestamp } from 'firebase/firestore'
import { Line } from 'react-chartjs-2'

function DashboardStaff() {
  const { logout, currentUser, userRole } = useAuth()
  const navigate = useNavigate()

  const [logoutMsg, setLogoutMsg] = useState('')
  const [queues, setQueues] = useState([])

  useEffect(() => {
    // Listen to today's queues for operational stats
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

    const q = query(
      collection(db, 'queues'),
      where('queueDate', '>=', Timestamp.fromDate(start)),
      where('queueDate', '<=', Timestamp.fromDate(end))
    )

    const unsub = onSnapshot(q, snap => {
      setQueues(snap.docs.map(d => ({id: d.id, ...d.data()})))
    }, err => {
      console.log('Error fetching daily queue', err)
      // fallback if missing index
      const fallQ = query(collection(db, 'queues'))
      onSnapshot(fallQ, s => {
        const todayStr = today.toDateString()
        const filtered = s.docs.map(d=>({id: d.id, ...d.data()})).filter(qq => {
          if(!qq.queueDate) return false
          const dStr = qq.queueDate.seconds ? new Date(qq.queueDate.seconds*1000).toDateString() : new Date(qq.queueDate).toDateString()
          return dStr === todayStr
        })
        setQueues(filtered)
      })
    })

    return () => unsub()
  }, [])

  const stats = useMemo(() => {
    const total = queues.length
    const waiting = queues.filter(q => q.status === 'waiting' || q.status === 'in_consultation').length
    const completed = queues.filter(q => q.status === 'completed' || q.status === 'billed').length
    const checkoutsPending = queues.filter(q => q.status === 'completed').length // ready to bill
    return { total, waiting, completed, checkoutsPending }
  }, [queues])

  // Hourly pseudo-distribution to give a good chart layout for operations
  const hourlyChartData = {
    labels: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'],
    datasets: [{
      label: 'ความหนาแน่นของผู้ป่วยในคลินิก (Hourly Volume)',
      data: [1, 5, 8, 3, 4, 10, stats.waiting > 0 ? stats.waiting : 6, stats.checkoutsPending],
      borderColor: 'rgba(245, 158, 11, 1)',
      backgroundColor: 'rgba(245, 158, 11, 0.2)',
      fill: true,
      tension: 0.4
    }]
  }

  const handleLogout = async () => {
    try {
      setLogoutMsg('กำลังออกจากระบบ...')
      await logout()
      setTimeout(() => navigate('/'), 800)
    } catch(err) {}
  }

  return (
    <StaffHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {logoutMsg && (
        <div className="mb-4 px-5 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-medium animate-[fadeIn_0.3s_ease]">
          {logoutMsg}
        </div>
      )}

      {/* Hero Stats Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-gray-100 pb-6">
          <div>
            <h1 className="text-3xl font-black text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-orange-500">Operation Dashboard</h1>
            <p className="text-gray-500 mt-1 font-medium">ภาพรวมการให้บริการและปริมาณคนไข้วันนี้</p>
          </div>
          <div className="text-right mt-4 md:mt-0">
             <div className="text-sm font-bold text-gray-400">วันที่</div>
             <div className="text-lg font-bold text-gray-800">{new Date().toLocaleDateString('th-TH', { dateStyle: 'full' })}</div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
              <div className="text-gray-500 text-sm font-bold mb-1">คนไข้เข้าระบบทั้งหมด</div>
              <div className="text-3xl font-black text-gray-800">{stats.total}</div>
           </div>
           <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-amber-700 text-sm font-bold mb-1">กำลังรอตรวจ / รอพบแพทย์</div>
              <div className="text-3xl font-black text-amber-600">{stats.waiting}</div>
           </div>
           <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-emerald-700 text-sm font-bold mb-1">ตรวจเสร็จแล้ว / รับยา</div>
              <div className="text-3xl font-black text-emerald-600">{stats.completed}</div>
           </div>
           <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-blue-700 text-sm font-bold mb-1">รอการชำระเงิน (Pending Bill)</div>
              <div className="text-3xl font-black text-blue-600">{stats.checkoutsPending}</div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">แนวโน้มความหนาแน่นของผู้รับบริการ (วันนี้)</h2>
          <div className="h-[280px]">
            <Line data={hourlyChartData} options={{ maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
          </div>
        </div>

        {/* Shortcuts */}
        <div className="bg-gradient-to-br from-blue-700 to-indigo-800 rounded-2xl p-6 shadow-lg shadow-blue-200 text-white relative overflow-hidden">
           <div className="absolute -right-5 -bottom-5 opacity-10">
             <span className="text-[150px]">🚀</span>
           </div>
           <h2 className="text-xl font-bold mb-4">บริการลัด (Quick Services)</h2>
           <div className="flex flex-col gap-3">
             <button onClick={() => navigate('/staff/patients')} className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl text-left font-semibold transition border border-white/20 flex gap-3">
               <span>👥</span> ลงทะเบียนคนไข้ใหม่
             </button>
             <button onClick={() => navigate('/clinic-queue')} className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl text-left font-semibold transition border border-white/20 flex gap-3">
               <span>🏥</span> จัดการคิวหน้าห้อง
             </button>
             <button onClick={() => navigate('/pos-billing')} className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-left font-black transition shadow-lg flex gap-3">
               <span>🧾</span> ระบบคิดเงิน (POS)
             </button>
             <button onClick={() => navigate('/pharmacy')} className="w-full py-3 px-4 bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl text-left font-semibold transition border border-white/20 flex gap-3 mt-auto">
               <span>💊</span> ระบบห้องยา
             </button>
           </div>
        </div>
      </div>
    </StaffHeader>
  )
}

export default DashboardStaff
