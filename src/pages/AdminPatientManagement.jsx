import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import AdminHeader from '../components/AdminHeader'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore'

// ──────────────────────────────────────────────
// Icons (inline SVG helpers)
// ──────────────────────────────────────────────
const IconPlus = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
)
const IconEdit = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
  </svg>
)
const IconTrash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
)
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
const IconClose = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
)

// ──────────────────────────────────────────────
// Empty‑state default form values
// ──────────────────────────────────────────────
const emptyForm = {
  hnnumber: '',
  firstname: '',
  lastname: '',
  gender: '',
  birthdate: '',
  phonenumber: '',
  address: '',
  allergyhistory: ''
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function AdminPatientManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  // Data
  const [patients, setPatients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  // UI state
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [logoutMsg, setLogoutMsg] = useState('')

  // ── Real‑time listener ──────────────────────
  useEffect(() => {
    const q = query(collection(db, 'patients'), orderBy('createdat', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setPatients(list)
    })
    return () => unsubscribe()
  }, [])

  // ── Auto‑hide success message ───────────────
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  // ── Helpers ─────────────────────────────────
  const goBack = () => {
    navigate('/dashboard-admin')
  }

  const handleLogout = async () => {
    try {
      setLogoutMsg('กำลังออกจากระบบ...')
      await logout()
      setLogoutMsg('ออกจากระบบสำเร็จ')
      setTimeout(() => {
        navigate('/')
      }, 800)
    } catch (error) {
      console.error('Logout error:', error)
      alert('เกิดข้อผิดพลาด: ' + error.message)
      setLogoutMsg('')
    }
  }

  const openAddModal = () => {
    setFormData(emptyForm)
    setIsEditing(false)
    setEditingId(null)
    setShowModal(true)
  }

  const openEditModal = (patient) => {
    setFormData({
      hnnumber: patient.hnnumber || '',
      firstname: patient.firstname || '',
      lastname: patient.lastname || '',
      gender: patient.gender || '',
      birthdate: patient.birthdate || '',
      phonenumber: patient.phonenumber || '',
      address: patient.address || '',
      allergyhistory: Array.isArray(patient.allergyhistory)
        ? patient.allergyhistory.join(', ')
        : ''
    })
    setIsEditing(true)
    setEditingId(patient.id)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setFormData(emptyForm)
    setIsEditing(false)
    setEditingId(null)
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // ── Save (Add / Update) ─────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const allergyArray = formData.allergyhistory
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      if (isEditing && editingId) {
        // Update
        await updateDoc(doc(db, 'patients', editingId), {
          hnnumber: formData.hnnumber.trim(),
          firstname: formData.firstname.trim(),
          lastname: formData.lastname.trim(),
          gender: formData.gender || '',
          birthdate: formData.birthdate,
          phonenumber: formData.phonenumber.trim(),
          address: formData.address.trim(),
          allergyhistory: allergyArray,
          updatedAt: serverTimestamp()
        })
        setSuccessMsg('อัปเดตข้อมูลคนไข้สำเร็จ')
      } else {
        // Add
        await addDoc(collection(db, 'patients'), {
          hnnumber: formData.hnnumber.trim(),
          firstname: formData.firstname.trim(),
          lastname: formData.lastname.trim(),
          gender: formData.gender || '',
          birthdate: formData.birthdate,
          phonenumber: formData.phonenumber.trim(),
          address: formData.address.trim(),
          allergyhistory: allergyArray,
          createdat: serverTimestamp()
        })
        setSuccessMsg('เพิ่มข้อมูลคนไข้สำเร็จ')
      }

      closeModal()
    } catch (err) {
      console.error('Save patient error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'patients', id))
      setDeleteConfirm(null)
      setSuccessMsg('ลบข้อมูลคนไข้สำเร็จ')
    } catch (err) {
      console.error('Delete patient error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // ── Filter ──────────────────────────────────
  const filtered = patients.filter((p) => {
    const term = searchTerm.toLowerCase()
    return (
      (p.hnnumber || '').toLowerCase().includes(term) ||
      (p.firstname || '').toLowerCase().includes(term) ||
      (p.lastname || '').toLowerCase().includes(term) ||
      (p.phonenumber || '').toLowerCase().includes(term)
    )
  })

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
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
      {/* ── Success toast ─────────────────── */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* ── Search + Stats ───────────────── */}
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-teal-600 bg-clip-text text-transparent">👥 จัดการข้อมูลคนไข้</h1>
          <p className="text-gray-600 mt-2">ฐานข้อมูลคนไข้สำหรับผู้ดูแลระบบ</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
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

          {/* Stat badge + Add button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-flex items-center justify-center h-7 min-w-[28px] px-2 rounded-full bg-teal-100 text-teal-700 font-bold text-xs">
                {filtered.length}
              </span>
              รายการ
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 active:scale-[0.97] transition-all font-semibold text-sm shadow-sm shadow-teal-200"
            >
              <IconPlus />
              เพิ่มคนไข้
            </button>
          </div>
        </div>

        {/* ── Table ─────────────────────── */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 to-teal-50 text-gray-600 text-left border-b border-gray-200">
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-teal-700">HN</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700">ชื่อ</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700">นามสกุล</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700">เพศ</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700">วันเกิด</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700">เบอร์โทร</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700">ที่อยู่</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap text-slate-700">ประวัติแพ้ยา</th>
                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap text-slate-700">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-12 text-center text-gray-400">
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
                    <td className="px-4 py-3 whitespace-nowrap">{patient.gender || '-'}</td>
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
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(patient)}
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                          title="แก้ไข"
                        >
                          <IconEdit />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(patient)}
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          title="ลบ"
                        >
                          <IconTrash />
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

      {/* ════════════════════════════════════════
          Modal: Add / Edit Patient
         ════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden animate-[scaleIn_0.2s_ease]">
            {/* Title bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white">
              <h2 className="text-lg font-bold text-slate-900">
                {isEditing ? 'แก้ไขข้อมูลคนไข้' : 'เพิ่มคนไข้ใหม่'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <IconClose />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* HN Number */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  เลข HN <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="hnnumber"
                  value={formData.hnnumber}
                  onChange={handleChange}
                  required
                  placeholder="เช่น HN-0001"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                />
              </div>

              {/* Name row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    ชื่อ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="firstname"
                    value={formData.firstname}
                    onChange={handleChange}
                    required
                    placeholder="ชื่อจริง"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    นามสกุล <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="lastname"
                    value={formData.lastname}
                    onChange={handleChange}
                    required
                    placeholder="นามสกุล"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                  />
                </div>
              </div>

              {/* Gender */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  เพศ
                </label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm bg-white"
                >
                  <option value="">ไม่ระบุ</option>
                  <option value="ชาย">ชาย</option>
                  <option value="หญิง">หญิง</option>
                  <option value="อื่นๆ">อื่นๆ</option>
                </select>
              </div>

              {/* Birth Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  วันเกิด
                </label>
                <input
                  type="date"
                  name="birthdate"
                  value={formData.birthdate}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  เบอร์โทรศัพท์ <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="phonenumber"
                  value={formData.phonenumber}
                  onChange={handleChange}
                  required
                  placeholder="0xx-xxx-xxxx"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  ที่อยู่
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows={2}
                  placeholder="ที่อยู่ของคนไข้"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm resize-none"
                />
              </div>

              {/* Allergy History */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  ประวัติการแพ้ยา
                </label>
                <input
                  type="text"
                  name="allergyhistory"
                  value={formData.allergyhistory}
                  onChange={handleChange}
                  placeholder="คั่นด้วยลูกน้ำ เช่น Paracetamol, Penicillin"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  ใส่ชื่อยาที่แพ้ คั่นด้วยลูกน้ำ (,) เช่น Paracetamol, Penicillin
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 active:scale-[0.97] transition-all shadow-sm shadow-teal-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving
                    ? 'กำลังบันทึก...'
                    : isEditing
                    ? 'อัปเดต'
                    : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          Modal: Delete Confirmation
         ════════════════════════════════════════ */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 text-center animate-[scaleIn_0.2s_ease]">
            {/* Warning icon */}
            <div className="mx-auto mb-4 h-14 w-14 flex items-center justify-center rounded-full bg-red-100/20 border border-red-200">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">ยืนยันการลบ</h3>
            <p className="text-sm text-gray-500 mb-6">
              คุณต้องการลบข้อมูลคนไข้{' '}
              <span className="font-semibold text-gray-700">
                {deleteConfirm.firstname} {deleteConfirm.lastname}
              </span>{' '}
              ({deleteConfirm.hnnumber}) ใช่หรือไม่?
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 active:scale-[0.97] transition-all"
              >
                ลบข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminHeader>
  )
}

export default AdminPatientManagement