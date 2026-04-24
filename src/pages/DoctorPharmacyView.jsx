import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import DoctorHeader from '../components/DoctorHeader'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount || 0)
}

function DoctorPharmacyView() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [medications, setMedications] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  // ── Fetch Medications ─────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'medications'), orderBy('name'))
    const unsub = onSnapshot(q, (snap) => {
      setMedications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    }, (error) => {
      console.error("Error fetching medications:", error)
    })

    return () => unsub()
  }, [])

  // ── Computed & Filters ────────────────────────
  const filteredMeds = useMemo(() => {
    if (!searchQuery) return medications
    const lowerQuery = searchQuery.toLowerCase()
    return medications.filter(m =>
      m.name.toLowerCase().includes(lowerQuery) ||
      m.category.toLowerCase().includes(lowerQuery)
    )
  }, [medications, searchQuery])

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/')
    } catch (err) {
      console.error("Logout failed", err)
    }
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <DoctorHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-6 md:p-8 animate-[fadeIn_0.3s_ease]">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              💊 <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600">ตรวจสอบคลังยา</span>
            </h1>
            <p className="text-gray-500 mt-1 text-sm">ดูรายการยาและยอดคงเหลือในคลัง เพื่อใช้เป็นข้อมูลในการสั่งยาให้คนไข้ (Read-only)</p>
          </div>
          
          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-400">🔍</span>
            </div>
            <input
              type="text"
              placeholder="ค้นหาชื่อยา หรือ หมวดหมู่..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none bg-gray-50 text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Categories Quick Filter Visuals (Optional/Future expansion) */}
        
        {/* Table View */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-50/50 text-emerald-800 text-left border-b border-emerald-100">
                <th className="px-5 py-4 font-bold rounded-tl-xl w-1/3">ชื่อยา / สินค้า</th>
                <th className="px-5 py-4 font-bold">หมวดหมู่</th>
                <th className="px-5 py-4 font-bold text-center">ยอดคงเหลือ</th>
                <th className="px-5 py-4 font-bold">หน่วย</th>
                <th className="px-5 py-4 font-bold text-right rounded-tr-xl">ราคาประเมิน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredMeds.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-5 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center">
                      <span className="text-3xl mb-2 grayscale opacity-50">💊</span>
                      <p>{searchQuery ? 'ไม่พบข้อมูลยาที่ค้นหา' : 'ยังไม่มีข้อมูลยาในระบบ'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMeds.map(med => {
                  const isOutOfStock = med.stock <= 0;
                  const isLowStock = med.stock <= (med.reorderPoint || 0) && med.stock > 0;
                  
                  return (
                    <tr key={med.id} className="hover:bg-emerald-50/30 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{med.name}</div>
                        {med.description && <div className="text-xs text-gray-500 mt-1 line-clamp-1">{med.description}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium">
                          {med.category}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          isOutOfStock ? 'bg-red-100 text-red-700 border border-red-200' :
                          isLowStock ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}>
                          {med.stock}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{med.unit}</td>
                      <td className="px-5 py-4 text-right">
                        <span className="font-semibold text-gray-700">{formatCurrency(med.price)}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-gray-500 px-2">
          <div>* อัปเดตข้อมูลแบบเรียลไทม์</div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> ปกติ</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> ใกล้หมด</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span> หมดสต็อก</span>
          </div>
        </div>

      </div>
    </DoctorHeader>
  )
}

export default DoctorPharmacyView
