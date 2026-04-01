import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore'
import DoctorHeader from '../components/DoctorHeader'

// ──────────────────────────────────────────────
// Icons (inline SVG helpers)
// ──────────────────────────────────────────────
const IconSearch = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
)
const IconBack = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
  </svg>
)
const IconEye = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
  </svg>
)

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function DoctorPatientManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  // Data
  const [patients, setPatients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  // ── Real‑time listener ──────────────────────
  useEffect(() => {
    const q = query(collection(db, 'patients'), orderBy('createdat', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setPatients(list)
    })
    return () => unsubscribe()
  }, [])

  // ── Helpers ─────────────────────────────────
  const handleLogout = async () => {
    try {
      await logout()
      navigate('/')
    } catch (error) {
      console.error('Logout error:', error)
      alert('เกิดข้อผิดพลาด: ' + error.message)
    }
  }

  // ── Filtered patients ───────────────────────
  const filtered = patients.filter((p) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      (p.hnnumber || '').toLowerCase().includes(term) ||
      (p.firstname || '').toLowerCase().includes(term) ||
      (p.lastname || '').toLowerCase().includes(term) ||
      (p.phonenumber || '').toLowerCase().includes(term)
    )
  })

  return (
    <DoctorHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto">
        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <IconSearch />
            </div>
            <input
              type="text"
              placeholder="ค้นหา HN, ชื่อ, นามสกุล, เบอร์โทร..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">HN</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">ชื่อ</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">นามสกุล</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">วันเกิด</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">เบอร์โทร</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">ที่อยู่</th>
                  <th className="px-4 py-3 font-semibold whitespace-nowrap">ประวัติแพ้ยา</th>
                  <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">ดูรายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        {searchTerm ? 'ไม่พบข้อมูลที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลคนไข้'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((patient) => (
                    <tr key={patient.id} className="hover:bg-teal-50/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-teal-700 whitespace-nowrap">
                        {patient.hnnumber}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{patient.firstname}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{patient.lastname}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {patient.birthdate ? new Date(patient.birthdate).toLocaleDateString('th-TH') : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{patient.phonenumber}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={patient.address}>
                        {patient.address}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(patient.allergyhistory) && patient.allergyhistory.length > 0
                            ? patient.allergyhistory.map((a, i) => (
                                <span
                                  key={i}
                                  className="inline-block px-2 py-0.5 bg-red-50 text-red-600 text-xs rounded-full border border-red-100"
                                >
                                  {a}
                                </span>
                              ))
                            : <span className="text-gray-400 text-xs">ไม่มี</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center">
                          <button
                            className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                            title="ดูรายละเอียด"
                          >
                            <IconEye />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <span>แสดง {filtered.length} จาก {patients.length} คนไข้</span>
          {searchTerm && (
            <span>ค้นหา: "{searchTerm}"</span>
          )}
        </div>
      </div>
    </DoctorHeader>
  )
}

export default DoctorPatientManagement