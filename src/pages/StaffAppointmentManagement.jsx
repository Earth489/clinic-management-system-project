import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import StaffHeader from '../components/StaffHeader'
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
const IconCalendar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
  </svg>
)

// ──────────────────────────────────────────────
// Mock Doctors Data (replace with real collection later)
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
// Service Types
// ──────────────────────────────────────────────
const serviceTypes = [
  'ตรวจทั่วไป',
  'ติดตามอาการ',
  'รับผลเลือด',
  'ฉีดวัคซีน',
  'ปรึกษา'
]

// ──────────────────────────────────────────────
// Empty form values
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function StaffAppointmentManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  // Data
  const [appointments, setAppointments] = useState([])
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  // UI state
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [statusChangeConfirm, setStatusChangeConfirm] = useState(null)
  const [statusChangeTarget, setStatusChangeTarget] = useState('confirmed')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0])
  const [successMsg, setSuccessMsg] = useState('')
  const [logoutMsg, setLogoutMsg] = useState('')
  const [conflictMsg, setConflictMsg] = useState('')

  // ── Real-time listeners ──────────────────────
  useEffect(() => {
    // Appointments
    const q = query(collection(db, 'appointments'), orderBy('appointmentDate', 'desc'))
    const unsubscribeAppointments = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setAppointments(list)
    })

    // Patients for dropdown
    const qPatients = query(collection(db, 'patients'), orderBy('firstname'))
    const unsubscribePatients = onSnapshot(qPatients, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setPatients(list)
    })

    // Doctors from user collection
    const qDoctors = query(
      collection(db, 'users'),
      where('role', '==', 'doctor')
    )
    const unsubscribeDoctors = onSnapshot(qDoctors, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const aName = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase()
        const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase()
        return aName.localeCompare(bName)
      })
      setDoctors(list)
    }, (error) => {
      console.error('Error loading doctor list:', error)
      setDoctors([])
    })

    return () => {
      unsubscribeAppointments()
      unsubscribePatients()
      unsubscribeDoctors()
    }
  }, [])

  // ── Auto-hide messages ───────────────────────
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  useEffect(() => {
    if (conflictMsg) {
      const t = setTimeout(() => setConflictMsg(''), 5000)
      return () => clearTimeout(t)
    }
  }, [conflictMsg])

  // ── Helpers ─────────────────────────────────
  const goBack = () => {
    navigate('/dashboard-staff')
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
    setConflictMsg('')
    setShowModal(true)
  }

  const openEditModal = (appointment) => {
    setFormData({
      patientId: appointment.patientId || '',
      patientName: appointment.patientName || '',
      doctorId: appointment.doctorId || '',
      appointmentDate: appointment.appointmentDate ? new Date(appointment.appointmentDate.seconds * 1000).toISOString().split('T')[0] : '',
      appointmentTime: appointment.appointmentTime || '',
      serviceType: appointment.serviceType || '',
      status: appointment.status || 'scheduled',
      notes: appointment.notes || ''
    })
    setIsEditing(true)
    setEditingId(appointment.id)
    setConflictMsg('')
    setShowModal(true)
  }

  const openScheduleModal = () => {
    setShowScheduleModal(true)
  }

  const closeScheduleModal = () => {
    setShowScheduleModal(false)
  }

  const closeModal = () => {
    setShowModal(false)
    setFormData(emptyForm)
    setConflictMsg('')
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })

    // Auto-fill patient name when patient selected
    if (name === 'patientId') {
      const selectedPatient = patients.find(p => p.id === value)
      if (selectedPatient) {
        setFormData(prev => ({
          ...prev,
          patientName: `${selectedPatient.firstname} ${selectedPatient.lastname}`.trim()
        }))
      }
    }
  }

  // ── Check for conflicts ──────────────────────
  const checkAppointmentConflict = async (doctorId, date, time, excludeId = null) => {
    // Query all appointments for the doctor with active status
    const q = query(
      collection(db, 'appointments'),
      where('doctorId', '==', doctorId),
      where('status', 'in', ['scheduled', 'confirmed'])
    )
    const snapshot = await getDocs(q)

    // Filter by date and time on client side
    const targetDate = new Date(date).toDateString()
    const conflicts = snapshot.docs.filter(doc => {
      const appt = doc.data()
      if (doc.id === excludeId) return false
      const apptDate = new Date(appt.appointmentDate.seconds * 1000).toDateString()
      return apptDate === targetDate && appt.appointmentTime === time
    })
    return conflicts.length > 0
  }

  // ── Save (Add / Update) ─────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setConflictMsg('')

    try {
      // Check for conflicts
      const hasConflict = await checkAppointmentConflict(
        formData.doctorId,
        formData.appointmentDate,
        formData.appointmentTime,
        isEditing ? editingId : null
      )

      if (hasConflict) {
        setConflictMsg('⚠️ มีนัดหมายซ้อนกันในเวลานี้แล้ว กรุณาเลือกเวลาใหม่')
        setSaving(false)
        return
      }

      const appointmentData = {
        patientId: formData.patientId,
        patientName: formData.patientName,
        doctorId: formData.doctorId,
        appointmentDate: new Date(formData.appointmentDate),
        appointmentTime: formData.appointmentTime,
        serviceType: formData.serviceType,
        status: formData.status,
        notes: formData.notes,
        updatedAt: serverTimestamp()
      }

      if (isEditing && editingId) {
        // Update
        await updateDoc(doc(db, 'appointments', editingId), appointmentData)
        setSuccessMsg('อัปเดตนัดหมายสำเร็จ')
      } else {
        // Add
        appointmentData.createdAt = serverTimestamp()
        appointmentData.createdBy = currentUser?.uid || null
        await addDoc(collection(db, 'appointments'), appointmentData)
        setSuccessMsg('เพิ่มนัดหมายสำเร็จ')
      }

      closeModal()
    } catch (err) {
      console.error('Save appointment error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────
  const openStatusChangeConfirm = (appointment) => {
    let defaultTarget = 'confirmed'
    if (appointment.status === 'scheduled') {
      defaultTarget = 'confirmed'
    } else if (appointment.status === 'confirmed') {
      defaultTarget = 'completed'
    } else if (appointment.status === 'completed') {
      defaultTarget = 'cancelled'
    } else if (appointment.status === 'cancelled') {
      defaultTarget = 'scheduled'
    }
    setStatusChangeConfirm({ id: appointment.id, currentStatus: appointment.status })
    setStatusChangeTarget(defaultTarget)
  }

  const handleConfirmStatusChange = async () => {
    if (!statusChangeConfirm) return
    if (!statusChangeTarget) {
      alert('กรุณาเลือกสถานะใหม่ก่อนยืนยัน')
      return
    }
    try {
      await updateDoc(doc(db, 'appointments', statusChangeConfirm.id), {
        status: statusChangeTarget,
        updatedAt: serverTimestamp()
      })
      setSuccessMsg(`เปลี่ยนสถานะเป็น ${statusChangeTarget} สำเร็จ`)
      setStatusChangeConfirm(null)
      setStatusChangeTarget('confirmed')
    } catch (err) {
      console.error('Status change error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  const handleDelete = async (appointmentId) => {
    try {
      await deleteDoc(doc(db, 'appointments', appointmentId))
      setSuccessMsg('ลบนัดหมายสำเร็จ')
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Delete appointment error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // ── Filter ──────────────────────────────────
  const filtered = appointments.filter((appt) => {
    const term = searchTerm.toLowerCase()
    const doctorName = doctors.find(d => d.id === appt.doctorId)
      ? `${doctors.find(d => d.id === appt.doctorId).firstName || ''} ${doctors.find(d => d.id === appt.doctorId).lastName || ''}`.trim()
      : ''

    return (
      (appt.patientName || '').toLowerCase().includes(term) ||
      (doctorName || '').toLowerCase().includes(term) ||
      (appt.serviceType || '').toLowerCase().includes(term) ||
      (appt.status || '').toLowerCase().includes(term)
    )
  })

  // ── Status badge ────────────────────────────
  const getStatusBadge = (status) => {
    const statusMap = {
      scheduled: { color: 'bg-blue-100 text-blue-700', label: 'นัดแล้ว' },
      confirmed: { color: 'bg-green-100 text-green-700', label: 'ยืนยันแล้ว' },
      cancelled: { color: 'bg-red-100 text-red-700', label: 'ยกเลิก' },
      completed: { color: 'bg-gray-100 text-gray-700', label: 'เสร็จสิ้น' }
    }
    const { color, label } = statusMap[status] || statusMap.scheduled
    return <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${color}`}>{label}</span>
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
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

      {/* ── Success toast ─────────────────── */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* ── Conflict warning ───────────────── */}
      {conflictMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl text-sm font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {conflictMsg}
        </div>
      )}

      {/* ── Search + Stats ───────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">จัดการนัดหมาย (Staff)</h1>
          <p className="text-gray-500 mt-1">จัดการการนัดหมายสำหรับคนไข้</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <IconSearch />
            </div>
            <input
              type="text"
              placeholder="ค้นหาชื่อคนไข้, ประเภทบริการ, สถานะ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
            />
          </div>

          {/* Stat badge + Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={openScheduleModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-[0.97] transition-all font-semibold text-sm shadow-sm shadow-blue-200"
            >
              <IconCalendar />
              ดูตารางแพทย์
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-flex items-center justify-center h-7 min-w-[28px] px-2 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                {filtered.length}
              </span>
              รายการ
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-[0.97] transition-all font-semibold text-sm shadow-sm shadow-emerald-200"
            >
              <IconPlus />
              เพิ่มนัดหมาย
            </button>
          </div>
        </div>

        {/* ── Table ─────────────────────── */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">วันที่</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">เวลา</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">คนไข้</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">แพทย์</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">บริการ</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">สถานะ</th>
                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <IconCalendar />
                      {searchTerm ? 'ไม่พบข้อมูลที่ตรงกับการค้นหา' : 'ยังไม่มีนัดหมาย'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((appt) => (
                  <tr key={appt.id} className="hover:bg-emerald-50/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {appt.appointmentDate ? new Date(appt.appointmentDate.seconds * 1000).toLocaleDateString('th-TH') : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{appt.appointmentTime || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{appt.patientName || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {doctors.find(d => d.id === appt.doctorId)
                        ? `${doctors.find(d => d.id === appt.doctorId).firstName || ''} ${doctors.find(d => d.id === appt.doctorId).lastName || ''}`.trim()
                        : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{appt.serviceType || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(appt.status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(appt)}
                          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                          title="แก้ไข"
                        >
                          <IconEdit />
                        </button>
                        <button
                          type="button"
                          onClick={() => openStatusChangeConfirm(appt)}
                          className="px-3 py-2 rounded-lg bg-yellow-100 text-yellow-900 hover:bg-yellow-200 transition-colors text-sm font-semibold"
                          title="เปลี่ยนสถานะ"
                        >
                          เปลี่ยนสถานะ
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirm(appt.id)}
                          className="px-3 py-2 rounded-lg bg-red-100 text-red-800 hover:bg-red-200 transition-colors text-sm font-semibold"
                          title="ลบ"
                        >
                          ลบ
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
          Modal: Add / Edit Appointment
         ════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden animate-[scaleIn_0.2s_ease]">
            {/* Title bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">
                {isEditing ? 'แก้ไขการนัดหมาย' : 'เพิ่มการนัดหมายใหม่'}
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
              {/* Patient Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  เลือกคนไข้ <span className="text-red-500">*</span>
                </label>
                <select
                  name="patientId"
                  value={formData.patientId}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                >
                  <option value="">เลือกคนไข้...</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.hnnumber} - {patient.firstname} {patient.lastname}
                    </option>
                  ))}
                </select>
              </div>

              {/* Patient Name (auto-filled) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  ชื่อคนไข้
                </label>
                <input
                  type="text"
                  value={formData.patientName}
                  readOnly
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm"
                  placeholder="จะแสดงอัตโนมัติเมื่อเลือกคนไข้"
                />
              </div>

              {/* Doctor Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  เลือกแพทย์ <span className="text-red-500">*</span>
                </label>
                <select
                  name="doctorId"
                  value={formData.doctorId}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                >
                  <option value="">เลือกแพทย์...</option>
                  {doctors.length === 0 ? (
                    <option value="" disabled>ไม่พบแพทย์ในระบบ</option>
                  ) : (
                    doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {`${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || doctor.email}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    วันที่นัด <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="appointmentDate"
                    value={formData.appointmentDate}
                    onChange={handleChange}
                    required
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    เวลานัด <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    name="appointmentTime"
                    value={formData.appointmentTime}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                  />
                </div>
              </div>

              {/* Service Type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  ประเภทบริการ <span className="text-red-500">*</span>
                </label>
                <select
                  name="serviceType"
                  value={formData.serviceType}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                >
                  <option value="">เลือกประเภทบริการ...</option>
                  {serviceTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  สถานะ
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                >
                  <option value="scheduled">นัดแล้ว</option>
                  <option value="confirmed">ยืนยันแล้ว</option>
                  <option value="cancelled">ยกเลิก</option>
                  <option value="completed">เสร็จสิ้น</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  บันทึกเพิ่มเติม
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="อาการเบื้องต้น หรือบันทึกเพิ่มเติม"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm resize-none"
                />
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
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 active:scale-[0.97] transition-all shadow-sm shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed"
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
          Modal: Status Change Confirmation
         ════════════════════════════════════════ */}
      {statusChangeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setStatusChangeConfirm(null)}
          />

          <div className="relative z-20 bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m2-4h.01M12 20c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันการเปลี่ยนสถานะ</h3>
              <p className="text-gray-500 text-sm mb-4">
                คุณต้องการเปลี่ยนสถานะจาก <span className="font-semibold">{statusChangeConfirm.currentStatus}</span> หรือไม่?
              </p>
              <div className="mb-4 text-left">
                <label className="block text-sm font-medium text-gray-700 mb-2">สถานะใหม่</label>
                <select
                  value={statusChangeTarget}
                  onChange={(e) => setStatusChangeTarget(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500/40 focus:border-yellow-400 transition-all text-sm"
                >
                  <option value="scheduled">นัดแล้ว</option>
                  <option value="confirmed">ยืนยันแล้ว</option>
                  <option value="completed">เสร็จสิ้น</option>
                  <option value="cancelled">ยกเลิก</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStatusChangeConfirm(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmStatusChange}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-yellow-600 rounded-xl hover:bg-yellow-700 transition-colors"
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDeleteConfirm(null)}
          />

          <div className="relative z-20 bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-6 0h6" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันการลบ</h3>
              <p className="text-gray-500 text-sm mb-6">
                คุณต้องการลบนัดหมายนี้หรือไม่? การดำเนินการนี้ไม่สามารถกู้คืนได้
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
                >
                  ลบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          Modal: Doctor Schedule
         ════════════════════════════════════════ */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeScheduleModal}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-xl overflow-hidden animate-[scaleIn_0.2s_ease]">
            {/* Title bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">
                ตารางการนัดหมายแพทย์
              </h2>
              <button
                onClick={closeScheduleModal}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <IconClose />
              </button>
            </div>

            {/* Date selector */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700">เลือกวันที่:</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all text-sm"
                />
              </div>
            </div>

            {/* Schedule Table */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-xl">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 font-semibold text-left border-b border-gray-200">เวลา</th>
                      {doctors.map((doctor) => (
                        <th key={doctor.id} className="px-4 py-3 font-semibold text-center border-b border-gray-200 min-w-[200px]">
                          {`${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || doctor.email}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Generate time slots from 09:00 to 17:00 */}
                    {Array.from({ length: 17 }, (_, i) => {
                      const hour = 9 + Math.floor(i / 2)
                      const minute = i % 2 === 0 ? '00' : '30'
                      const timeSlot = `${hour.toString().padStart(2, '0')}:${minute}`

                      return (
                        <tr key={timeSlot} className="border-b border-gray-100">
                          <td className="px-4 py-2 font-mono font-semibold text-gray-700 bg-gray-50">
                            {timeSlot}
                          </td>
                          {doctors.map((doctor) => {
                            // Find appointment for this doctor, date, and time
                            const appointment = appointments.find(appt => {
                              const apptDate = appt.appointmentDate ? new Date(appt.appointmentDate.seconds * 1000).toISOString().split('T')[0] : ''
                              return appt.doctorId === doctor.id &&
                                     apptDate === scheduleDate &&
                                     appt.appointmentTime === timeSlot &&
                                     ['scheduled', 'confirmed'].includes(appt.status)
                            })

                            return (
                              <td key={doctor.id} className="px-4 py-2 text-center">
                                {appointment ? (
                                  <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                                    <div className="text-xs font-semibold text-red-700">
                                      {appointment.patientName}
                                    </div>
                                    <div className="text-xs text-red-600">
                                      {appointment.serviceType}
                                    </div>
                                    <div className="text-xs text-red-500">
                                      {getStatusBadge(appointment.status).props.children}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
                                    <div className="text-xs font-semibold text-green-700">
                                      ว่าง
                                    </div>
                                  </div>
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
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={closeScheduleModal}
                className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </StaffHeader>
  )
}

export default StaffAppointmentManagement