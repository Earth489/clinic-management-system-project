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
  orderBy,
  where,
  getDocs
} from 'firebase/firestore'

// ──────────────────────────────────────────────
// Service Types
// ──────────────────────────────────────────────
const serviceTypes = ['ตรวจทั่วไป', 'ติดตามอาการ', 'รับผลเลือด', 'ฉีดวัคซีน', 'ปรึกษา']

const emptyForm = {
  patientId: '',
  patientName: '',
  doctorId: '',
  appointmentDate: '',
  appointmentTime: '',
  serviceType: '',
  status: 'scheduled',
  notes: ''
}

const STATUS_MAP = {
  scheduled: { color: 'bg-blue-100 text-blue-700', label: 'นัดแล้ว' },
  confirmed: { color: 'bg-green-100 text-green-700', label: 'ยืนยันแล้ว' },
  cancelled: { color: 'bg-red-100 text-red-700', label: 'ยกเลิก' },
  completed: { color: 'bg-gray-100 text-gray-700', label: 'เสร็จสิ้น' }
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function AdminAppointmentManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [appointments, setAppointments] = useState([])
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDoctor, setFilterDoctor] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0])
  const [successMsg, setSuccessMsg] = useState('')
  const [conflictMsg, setConflictMsg] = useState('')
  const [logoutMsg, setLogoutMsg] = useState('')

  // ── Real-time listeners ──────────────────────
  useEffect(() => {
    const q = query(collection(db, 'appointments'), orderBy('appointmentDate', 'desc'))
    const unsubAppts = onSnapshot(q, (snap) => {
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    const qPatients = query(collection(db, 'patients'), orderBy('firstname'))
    const unsubPatients = onSnapshot(qPatients, (snap) => {
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    const qDoctors = query(collection(db, 'users'), where('role', '==', 'doctor'))
    const unsubDoctors = onSnapshot(qDoctors, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => `${a.firstName || ''}`.localeCompare(`${b.firstName || ''}`))
      setDoctors(list)
    })

    return () => { unsubAppts(); unsubPatients(); unsubDoctors() }
  }, [])

  useEffect(() => {
    if (successMsg) { const t = setTimeout(() => setSuccessMsg(''), 3000); return () => clearTimeout(t) }
  }, [successMsg])
  useEffect(() => {
    if (conflictMsg) { const t = setTimeout(() => setConflictMsg(''), 5000); return () => clearTimeout(t) }
  }, [conflictMsg])

  // ── Helpers ──────────────────────────────────
  const getDoctorName = (id) => {
    const d = doctors.find(x => x.id === id)
    return d ? `${d.firstName || ''} ${d.lastName || ''}`.trim() : '-'
  }

  const handleLogout = async () => {
    try {
      setLogoutMsg('กำลังออกจากระบบ...')
      await logout()
      setLogoutMsg('ออกจากระบบสำเร็จ')
      setTimeout(() => navigate('/'), 800)
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
      setLogoutMsg('')
    }
  }

  const openAddModal = () => { setFormData(emptyForm); setIsEditing(false); setEditingId(null); setConflictMsg(''); setShowModal(true) }

  const openEditModal = (appt) => {
    setFormData({
      patientId: appt.patientId || '',
      patientName: appt.patientName || '',
      doctorId: appt.doctorId || '',
      appointmentDate: appt.appointmentDate ? new Date(appt.appointmentDate.seconds * 1000).toISOString().split('T')[0] : '',
      appointmentTime: appt.appointmentTime || '',
      serviceType: appt.serviceType || '',
      status: appt.status || 'scheduled',
      notes: appt.notes || ''
    })
    setIsEditing(true); setEditingId(appt.id); setConflictMsg(''); setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setFormData(emptyForm); setConflictMsg('') }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (name === 'patientId') {
      const p = patients.find(x => x.id === value)
      if (p) setFormData(prev => ({ ...prev, patientName: `${p.firstname} ${p.lastname}`.trim() }))
    }
  }

  const checkConflict = async (doctorId, date, time, excludeId = null) => {
    const q = query(collection(db, 'appointments'), where('doctorId', '==', doctorId), where('status', 'in', ['scheduled', 'confirmed']))
    const snap = await getDocs(q)
    const targetDate = new Date(date).toDateString()
    return snap.docs.filter(d => {
      if (d.id === excludeId) return false
      const a = d.data()
      return new Date(a.appointmentDate.seconds * 1000).toDateString() === targetDate && a.appointmentTime === time
    }).length > 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setConflictMsg('')
    try {
      const conflict = await checkConflict(formData.doctorId, formData.appointmentDate, formData.appointmentTime, isEditing ? editingId : null)
      if (conflict) { setConflictMsg('⚠️ มีนัดหมายซ้อนในเวลานี้แล้ว กรุณาเลือกเวลาใหม่'); setSaving(false); return }

      const data = {
        patientId: formData.patientId, patientName: formData.patientName, doctorId: formData.doctorId,
        appointmentDate: new Date(formData.appointmentDate), appointmentTime: formData.appointmentTime,
        serviceType: formData.serviceType, status: formData.status, notes: formData.notes, updatedAt: serverTimestamp()
      }

      if (isEditing && editingId) {
        await updateDoc(doc(db, 'appointments', editingId), data)
        setSuccessMsg('อัปเดตนัดหมายสำเร็จ')
      } else {
        data.createdAt = serverTimestamp()
        data.createdBy = currentUser?.uid || null
        await addDoc(collection(db, 'appointments'), data)
        setSuccessMsg('เพิ่มนัดหมายสำเร็จ')
      }
      closeModal()
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try { await deleteDoc(doc(db, 'appointments', id)); setSuccessMsg('ลบนัดหมายสำเร็จ'); setDeleteConfirm(null) }
    catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) }
  }

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, 'appointments', id), { status: newStatus, updatedAt: serverTimestamp() })
      setSuccessMsg(`เปลี่ยนสถานะเป็น ${STATUS_MAP[newStatus]?.label} สำเร็จ`)
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) }
  }

  // ── Filtered list ────────────────────────────
  const filtered = appointments.filter(appt => {
    const term = searchTerm.toLowerCase()
    const doctorName = getDoctorName(appt.doctorId).toLowerCase()
    const matchSearch = (appt.patientName || '').toLowerCase().includes(term) || doctorName.includes(term) || (appt.serviceType || '').toLowerCase().includes(term)
    const matchDoctor = filterDoctor === 'all' || appt.doctorId === filterDoctor
    const matchStatus = filterStatus === 'all' || appt.status === filterStatus
    return matchSearch && matchDoctor && matchStatus
  })

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <AdminHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {/* Toasts */}
      {logoutMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-teal-500/20 border border-teal-500/50 text-teal-100 rounded-xl text-sm font-medium">{logoutMsg}</div>
      )}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">✅ {successMsg}</div>
      )}
      {conflictMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl text-sm font-medium">{conflictMsg}</div>
      )}

      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">ADMIN</span>
            <h1 className="text-2xl font-bold text-gray-900">จัดการนัดหมาย</h1>
          </div>
          <p className="text-gray-500 text-sm">สิทธิ์ Superuser — ดู สร้าง แก้ไข ลบได้ทั้งหมด</p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="text" placeholder="ค้นหาชื่อคนไข้, แพทย์, บริการ..."
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 text-sm"
            />
          </div>

          {/* Filters */}
          <select value={filterDoctor} onChange={(e) => setFilterDoctor(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40">
            <option value="all">แพทย์ทั้งหมด</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{getDoctorName(d.id)}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40">
            <option value="all">ทุกสถานะ</option>
            <option value="scheduled">นัดแล้ว</option>
            <option value="confirmed">ยืนยัน</option>
            <option value="completed">เสร็จ</option>
            <option value="cancelled">ยกเลิก</option>
          </select>

          {/* Buttons */}
          <div className="flex gap-2">
            <button onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-semibold text-sm">
              📅 ตารางแพทย์
            </button>
            <button onClick={openAddModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all font-semibold text-sm">
              ➕ เพิ่มนัดหมาย
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-center">
            <div className="text-xl font-bold text-gray-700">{filtered.length}</div>
            <div className="text-xs text-gray-500">ทั้งหมด</div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
            <div className="text-xl font-bold text-blue-700">{appointments.filter(a => a.status === 'scheduled').length}</div>
            <div className="text-xs text-blue-600">นัดแล้ว</div>
          </div>
          <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-center">
            <div className="text-xl font-bold text-green-700">{appointments.filter(a => a.status === 'confirmed').length}</div>
            <div className="text-xs text-green-600">ยืนยัน</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
            <div className="text-xl font-bold text-emerald-700">{appointments.filter(a => a.status === 'completed').length}</div>
            <div className="text-xs text-emerald-600">เสร็จ</div>
          </div>
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-center">
            <div className="text-xl font-bold text-red-700">{appointments.filter(a => a.status === 'cancelled').length}</div>
            <div className="text-xs text-red-600">ยกเลิก</div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-semibold">วันที่</th>
                <th className="px-4 py-3 font-semibold">เวลา</th>
                <th className="px-4 py-3 font-semibold">คนไข้</th>
                <th className="px-4 py-3 font-semibold">แพทย์</th>
                <th className="px-4 py-3 font-semibold">บริการ</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3 font-semibold text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400">ไม่พบนัดหมาย</td></tr>
              ) : (
                filtered.map(appt => (
                  <tr key={appt.id} className="hover:bg-teal-50/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{appt.appointmentDate ? new Date(appt.appointmentDate.seconds * 1000).toLocaleDateString('th-TH') : '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{appt.appointmentTime || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{appt.patientName || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{getDoctorName(appt.doctorId)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{appt.serviceType || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        value={appt.status}
                        onChange={(e) => handleStatusChange(appt.id, e.target.value)}
                        className={`px-2 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer ${STATUS_MAP[appt.status]?.color || ''}`}
                      >
                        <option value="scheduled">นัดแล้ว</option>
                        <option value="confirmed">ยืนยัน</option>
                        <option value="completed">เสร็จ</option>
                        <option value="cancelled">ยกเลิก</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditModal(appt)} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors" title="แก้ไข">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                        </button>
                        <button onClick={() => setDeleteConfirm(appt.id)} className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors" title="ลบ">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
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

      {/* ═══ Add/Edit Modal ═══ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">{isEditing ? '🔧 แก้ไขนัดหมาย (Admin)' : '➕ เพิ่มนัดหมายใหม่ (Admin)'}</h2>
              <button onClick={closeModal} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">✕</button>
            </div>
            {conflictMsg && <div className="mx-6 mt-4 px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">{conflictMsg}</div>}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">คนไข้ <span className="text-red-500">*</span></label>
                <select name="patientId" value={formData.patientId} onChange={handleChange} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/40">
                  <option value="">เลือกคนไข้...</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.hnnumber} - {p.firstname} {p.lastname}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อคนไข้</label>
                <input type="text" value={formData.patientName} readOnly className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">แพทย์ <span className="text-red-500">*</span></label>
                <select name="doctorId" value={formData.doctorId} onChange={handleChange} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/40">
                  <option value="">เลือกแพทย์...</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{getDoctorName(d.id)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">วันที่นัด <span className="text-red-500">*</span></label>
                  <input type="date" name="appointmentDate" value={formData.appointmentDate} onChange={handleChange} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/40" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">เวลา <span className="text-red-500">*</span></label>
                  <input type="time" name="appointmentTime" value={formData.appointmentTime} onChange={handleChange} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/40" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">บริการ <span className="text-red-500">*</span></label>
                  <select name="serviceType" value={formData.serviceType} onChange={handleChange} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/40">
                    <option value="">เลือก...</option>
                    {serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">สถานะ</label>
                  <select name="status" value={formData.status} onChange={handleChange} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/40">
                    <option value="scheduled">นัดแล้ว</option><option value="confirmed">ยืนยัน</option>
                    <option value="completed">เสร็จ</option><option value="cancelled">ยกเลิก</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">บันทึก</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} placeholder="หมายเหตุ..." className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-teal-500/40" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">ยกเลิก</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-60">{saving ? 'กำลังบันทึก...' : isEditing ? 'อัปเดต' : 'บันทึก'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Delete Confirm ═══ */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-md w-full text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4"><span className="text-2xl">🗑️</span></div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันการลบ</h3>
            <p className="text-gray-500 text-sm mb-6">การดำเนินการนี้ไม่สามารถกู้คืนได้</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">ยกเลิก</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700">ลบ</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Doctor Schedule Modal ═══ */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowScheduleModal(false)} />
          <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">📅 ตารางนัดหมายแพทย์ (Admin View)</h2>
              <button onClick={() => setShowScheduleModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">✕</button>
            </div>
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700">วันที่:</label>
                <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/40" />
              </div>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm border border-gray-200 rounded-xl">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 font-semibold text-left border-b border-gray-200">เวลา</th>
                    {doctors.map(d => (
                      <th key={d.id} className="px-4 py-3 font-semibold text-center border-b border-gray-200 min-w-[200px]">{getDoctorName(d.id)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 17 }, (_, i) => {
                    const hour = 9 + Math.floor(i / 2)
                    const minute = i % 2 === 0 ? '00' : '30'
                    const timeSlot = `${hour.toString().padStart(2, '0')}:${minute}`
                    return (
                      <tr key={timeSlot} className="border-b border-gray-100">
                        <td className="px-4 py-2 font-mono font-semibold text-gray-700 bg-gray-50">{timeSlot}</td>
                        {doctors.map(d => {
                          const appt = appointments.find(a => {
                            const ad = a.appointmentDate ? new Date(a.appointmentDate.seconds * 1000).toISOString().split('T')[0] : ''
                            return a.doctorId === d.id && ad === scheduleDate && a.appointmentTime === timeSlot && ['scheduled', 'confirmed'].includes(a.status)
                          })
                          return (
                            <td key={d.id} className="px-4 py-2 text-center">
                              {appt ? (
                                <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                                  <div className="text-xs font-semibold text-red-700">{appt.patientName}</div>
                                  <div className="text-xs text-red-500">{appt.serviceType}</div>
                                </div>
                              ) : (
                                <div className="p-2 bg-green-50 border border-green-200 rounded-lg"><div className="text-xs font-semibold text-green-700">ว่าง</div></div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setShowScheduleModal(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </AdminHeader>
  )
}

export default AdminAppointmentManagement
