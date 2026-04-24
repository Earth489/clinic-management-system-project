import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import StaffHeader from '../components/StaffHeader'
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  getDocs,
  Timestamp
} from 'firebase/firestore'

// ──────────────────────────────────────────────
// Helper: today date boundaries
// ──────────────────────────────────────────────
function getTodayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  return { start, end }
}

function formatDate(date) {
  return date.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function formatTime(date) {
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

// ──────────────────────────────────────────────
// Status configuration
// ──────────────────────────────────────────────
const STATUS_CONFIG = {
  waiting: {
    label: 'รอตรวจ',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    dotColor: 'bg-amber-500',
    icon: '⏳'
  },
  in_consultation: {
    label: 'กำลังตรวจ',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    dotColor: 'bg-blue-500',
    icon: '🩺'
  },
  completed: {
    label: 'ตรวจเสร็จ',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotColor: 'bg-emerald-500',
    icon: '✅'
  },
  on_hold: {
    label: 'พักคิว',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    dotColor: 'bg-purple-500',
    icon: '⏸️'
  },
  skipped: {
    label: 'ข้ามคิว',
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    dotColor: 'bg-gray-400',
    icon: '⏭️'
  }
}

const PRIORITY_CONFIG = {
  normal: { label: 'ปกติ', color: 'bg-gray-100 text-gray-700', icon: '' },
  emergency: { label: 'ฉุกเฉิน', color: 'bg-red-100 text-red-700 border border-red-300', icon: '🚨' }
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function StaffQueueManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  // Data
  const [queues, setQueues] = useState([])
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [appointments, setAppointments] = useState([])

  // UI state
  const [showWalkInModal, setShowWalkInModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDoctor, setFilterDoctor] = useState('all')
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [logoutMsg, setLogoutMsg] = useState('')
  const [confirmAction, setConfirmAction] = useState(null) // { type, queueId, data }

  // Walk-in form
  const [walkInForm, setWalkInForm] = useState({
    patientId: '',
    patientName: '',
    doctorId: '',
    serviceType: 'ตรวจทั่วไป',
    notes: '',
    priority: 'normal'
  })

  const serviceTypes = ['ตรวจทั่วไป', 'ติดตามอาการ', 'รับผลเลือด', 'ฉีดวัคซีน', 'ปรึกษา']

  // ── Real-time listeners ──────────────────────
  useEffect(() => {
    const { start, end } = getTodayRange()

    // Today's queues
    const qQueue = query(
      collection(db, 'queues'),
      where('queueDate', '>=', Timestamp.fromDate(start)),
      where('queueDate', '<=', Timestamp.fromDate(end)),
      orderBy('queueDate', 'asc')
    )
    const unsubQueues = onSnapshot(qQueue, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setQueues(list)
    }, (error) => {
      console.error('Queue listener error:', error)
      // Fallback: listen without date filter if index not ready
      const qFallback = query(collection(db, 'queues'), orderBy('createdAt', 'desc'))
      onSnapshot(qFallback, (snap) => {
        const today = new Date().toDateString()
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(q => {
            if (!q.queueDate) return false
            const qDate = q.queueDate.seconds
              ? new Date(q.queueDate.seconds * 1000).toDateString()
              : new Date(q.queueDate).toDateString()
            return qDate === today
          })
        setQueues(list)
      })
    })

    // Patients
    const qPatients = query(collection(db, 'patients'), orderBy('firstname'))
    const unsubPatients = onSnapshot(qPatients, (snapshot) => {
      setPatients(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
    })

    // Doctors
    const qDoctors = query(collection(db, 'users'), where('role', '==', 'doctor'))
    const unsubDoctors = onSnapshot(qDoctors, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const aName = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase()
        const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase()
        return aName.localeCompare(bName)
      })
      setDoctors(list)
    })

    // Today's appointments (for import)
    const qAppts = query(
      collection(db, 'appointments'),
      where('status', 'in', ['scheduled', 'confirmed'])
    )
    const unsubAppts = onSnapshot(qAppts, (snapshot) => {
      const today = new Date().toDateString()
      const list = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(appt => {
          if (!appt.appointmentDate) return false
          const apptDate = new Date(appt.appointmentDate.seconds * 1000).toDateString()
          return apptDate === today
        })
      setAppointments(list)
    })

    return () => {
      unsubQueues()
      unsubPatients()
      unsubDoctors()
      unsubAppts()
    }
  }, [])

  // Auto-hide success messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  // ── Computed data ────────────────────────────
  const sortedQueues = useMemo(() => {
    // Sort: emergency first, then by queue number, on_hold goes lower
    return [...queues].sort((a, b) => {
      // Active statuses first (waiting, in_consultation), then on_hold, then completed/skipped
      const statusOrder = { in_consultation: 0, waiting: 1, on_hold: 2, skipped: 3, completed: 4 }
      const aOrder = statusOrder[a.status] ?? 5
      const bOrder = statusOrder[b.status] ?? 5
      if (aOrder !== bOrder) return aOrder - bOrder

      // Emergency first within same status
      if (a.priority === 'emergency' && b.priority !== 'emergency') return -1
      if (a.priority !== 'emergency' && b.priority === 'emergency') return 1

      // Then by queue number
      return (a.queueNumber || 0) - (b.queueNumber || 0)
    })
  }, [queues])

  const filteredQueues = useMemo(() => {
    return sortedQueues.filter(q => {
      if (filterStatus !== 'all' && q.status !== filterStatus) return false
      if (filterDoctor !== 'all' && q.doctorId !== filterDoctor) return false
      return true
    })
  }, [sortedQueues, filterStatus, filterDoctor])

  const stats = useMemo(() => ({
    total: queues.length,
    waiting: queues.filter(q => q.status === 'waiting').length,
    inConsultation: queues.filter(q => q.status === 'in_consultation').length,
    completed: queues.filter(q => q.status === 'completed').length,
    onHold: queues.filter(q => q.status === 'on_hold').length,
    skipped: queues.filter(q => q.status === 'skipped').length,
    emergency: queues.filter(q => q.priority === 'emergency' && q.status === 'waiting').length
  }), [queues])

  const currentQueue = useMemo(() => {
    return queues.find(q => q.status === 'in_consultation')
  }, [queues])

  const nextInLine = useMemo(() => {
    const waiting = queues
      .filter(q => q.status === 'waiting')
      .sort((a, b) => {
        if (a.priority === 'emergency' && b.priority !== 'emergency') return -1
        if (a.priority !== 'emergency' && b.priority === 'emergency') return 1
        return (a.queueNumber || 0) - (b.queueNumber || 0)
      })
    return waiting[0] || null
  }, [queues])

  // Queue numbers already used today
  const importedAppointmentIds = useMemo(() => {
    return new Set(queues.filter(q => q.appointmentId).map(q => q.appointmentId))
  }, [queues])

  const importableAppointments = useMemo(() => {
    return appointments.filter(a => !importedAppointmentIds.has(a.id))
  }, [appointments, importedAppointmentIds])

  // ── Helpers ──────────────────────────────────
  const getDoctorName = (doctorId) => {
    const doc = doctors.find(d => d.id === doctorId)
    return doc ? `${doc.firstName || ''} ${doc.lastName || ''}`.trim() : '-'
  }

  const getNextQueueNumber = () => {
    if (queues.length === 0) return 1
    const maxNum = Math.max(...queues.map(q => q.queueNumber || 0))
    return maxNum + 1
  }

  const handleLogout = async () => {
    try {
      setLogoutMsg('กำลังออกจากระบบ...')
      await logout()
      setLogoutMsg('ออกจากระบบสำเร็จ')
      setTimeout(() => navigate('/'), 800)
    } catch (error) {
      console.error('Logout error:', error)
      alert('เกิดข้อผิดพลาด: ' + error.message)
      setLogoutMsg('')
    }
  }

  // ── Queue Actions ────────────────────────────

  // Import single appointment into queue
  const importAppointment = async (appt) => {
    setSaving(true)
    try {
      const queueData = {
        queueNumber: getNextQueueNumber(),
        patientId: appt.patientId || '',
        patientName: appt.patientName || '',
        doctorId: appt.doctorId || '',
        type: 'appointment',
        appointmentId: appt.id,
        priority: 'normal',
        status: 'waiting',
        serviceType: appt.serviceType || 'ตรวจทั่วไป',
        notes: appt.notes || '',
        queueDate: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        calledAt: null,
        completedAt: null
      }
      await addDoc(collection(db, 'queues'), queueData)
      setSuccessMsg(`เพิ่มคิว ${appt.patientName} สำเร็จ`)
    } catch (err) {
      console.error('Import appointment error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Import all today's appointments
  const importAllAppointments = async () => {
    if (importableAppointments.length === 0) return
    setSaving(true)
    try {
      let nextNum = getNextQueueNumber()
      for (const appt of importableAppointments) {
        const queueData = {
          queueNumber: nextNum++,
          patientId: appt.patientId || '',
          patientName: appt.patientName || '',
          doctorId: appt.doctorId || '',
          type: 'appointment',
          appointmentId: appt.id,
          priority: 'normal',
          status: 'waiting',
          serviceType: appt.serviceType || 'ตรวจทั่วไป',
          notes: appt.notes || '',
          queueDate: Timestamp.fromDate(new Date()),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          calledAt: null,
          completedAt: null
        }
        await addDoc(collection(db, 'queues'), queueData)
      }
      setSuccessMsg(`นำเข้า ${importableAppointments.length} นัดหมายเข้าคิวสำเร็จ`)
      setShowImportModal(false)
    } catch (err) {
      console.error('Import all error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Add walk-in patient
  const handleAddWalkIn = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const queueData = {
        queueNumber: getNextQueueNumber(),
        patientId: walkInForm.patientId,
        patientName: walkInForm.patientName,
        doctorId: walkInForm.doctorId,
        type: 'walk-in',
        appointmentId: null,
        priority: walkInForm.priority,
        status: 'waiting',
        serviceType: walkInForm.serviceType,
        notes: walkInForm.notes,
        queueDate: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        calledAt: null,
        completedAt: null
      }
      await addDoc(collection(db, 'queues'), queueData)
      setSuccessMsg(`เพิ่มคิว Walk-in ${walkInForm.patientName} สำเร็จ`)
      setShowWalkInModal(false)
      setWalkInForm({
        patientId: '', patientName: '', doctorId: '',
        serviceType: 'ตรวจทั่วไป', notes: '', priority: 'normal'
      })
    } catch (err) {
      console.error('Add walk-in error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Change queue status
  const changeQueueStatus = async (queueId, newStatus) => {
    if (newStatus === 'skipped') {
      if (!window.confirm('คุณแน่ใจหรือไม่ที่จะข้ามคิวนี้? (สามารถนำกลับมาเรียกใหม่ได้ทีหลัง)')) return
    }
    if (newStatus === 'completed') {
      if (!window.confirm('ต้องการจบการทำงานของคิวนี้ และตัดออกจากระบบคิวใช่หรือไม่?')) return
    }
    try {
      const updateData = {
        status: newStatus,
        updatedAt: serverTimestamp()
      }
      if (newStatus === 'in_consultation') {
        updateData.calledAt = serverTimestamp()
      }
      if (newStatus === 'completed') {
        updateData.completedAt = serverTimestamp()
      }
      await updateDoc(doc(db, 'queues', queueId), updateData)
      setSuccessMsg(`อัปเดตสถานะเป็น "${STATUS_CONFIG[newStatus].label}" สำเร็จ`)
      setConfirmAction(null)
    } catch (err) {
      console.error('Status change error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // Set emergency priority
  const setEmergencyPriority = async (queueId) => {
    try {
      await updateDoc(doc(db, 'queues', queueId), {
        priority: 'emergency',
        updatedAt: serverTimestamp()
      })
      setSuccessMsg('ตั้งเป็นเคสฉุกเฉิน — ลัดคิวสำเร็จ')
      setConfirmAction(null)
    } catch (err) {
      console.error('Emergency priority error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // Call next queue
  const callNextQueue = async () => {
    if (!nextInLine) {
      alert('ไม่มีคิวที่รออยู่')
      return
    }
    // If there's a current consultation, complete it first
    if (currentQueue) {
      await changeQueueStatus(currentQueue.id, 'completed')
    }
    await changeQueueStatus(nextInLine.id, 'in_consultation')
  }

  // Walk-in form patient selection
  const handleWalkInChange = (e) => {
    const { name, value } = e.target
    setWalkInForm(prev => ({ ...prev, [name]: value }))
    if (name === 'patientId') {
      const p = patients.find(pt => pt.id === value)
      if (p) {
        setWalkInForm(prev => ({
          ...prev,
          patientId: value,
          patientName: `${p.firstname} ${p.lastname}`.trim()
        }))
      }
    }
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <StaffHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {/* ── Toasts ───────────────────────────── */}
      {logoutMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {logoutMsg}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* ════════════════════════════════════════════
          SECTION: Header + Stats
         ════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">คิวตรวจวันนี้</h1>
            <p className="text-gray-500 mt-1">{formatDate(new Date())}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-[0.97] transition-all font-semibold text-sm shadow-sm shadow-blue-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              ดึงนัดหมายวันนี้
              {importableAppointments.length > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-white/30 text-xs font-bold">
                  {importableAppointments.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowWalkInModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-[0.97] transition-all font-semibold text-sm shadow-sm shadow-emerald-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Walk-in
            </button>
            <button
              onClick={callNextQueue}
              disabled={!nextInLine}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 active:scale-[0.97] transition-all font-semibold text-sm shadow-sm shadow-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              เรียกคิวถัดไป
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'ทั้งหมด', value: stats.total, color: 'bg-gray-50 text-gray-700 border-gray-200' },
            { label: 'รอตรวจ', value: stats.waiting, color: 'bg-amber-50 text-amber-700 border-amber-200' },
            { label: 'กำลังตรวจ', value: stats.inConsultation, color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { label: 'เสร็จแล้ว', value: stats.completed, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            { label: 'พักคิว', value: stats.onHold, color: 'bg-purple-50 text-purple-700 border-purple-200' },
            { label: 'ข้ามคิว', value: stats.skipped, color: 'bg-gray-50 text-gray-500 border-gray-200' },
            { label: 'ฉุกเฉิน', value: stats.emergency, color: 'bg-red-50 text-red-700 border-red-200' },
          ].map((stat) => (
            <div key={stat.label} className={`p-3 rounded-xl border ${stat.color} text-center`}>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs font-medium mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION: Current Queue Display
         ════════════════════════════════════════════ */}
      {currentQueue && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-lg shadow-blue-200 p-6 md:p-8 mb-6 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl backdrop-blur-sm">
                <span className="text-3xl font-bold">{currentQueue.queueNumber}</span>
              </div>
              <div>
                <div className="text-blue-200 text-sm font-medium">กำลังตรวจ</div>
                <div className="text-xl font-bold">{currentQueue.patientName}</div>
                <div className="text-blue-200 text-sm">
                  แพทย์: {getDoctorName(currentQueue.doctorId)} • {currentQueue.serviceType}
                  {currentQueue.priority === 'emergency' && (
                    <span className="ml-2 px-2 py-0.5 bg-red-500 text-white rounded-full text-xs font-bold">🚨 ฉุกเฉิน</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => changeQueueStatus(currentQueue.id, 'on_hold')}
                className="px-4 py-2 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all font-semibold text-sm backdrop-blur-sm"
              >
                ⏸️ พักคิว
              </button>
              <button
                onClick={() => changeQueueStatus(currentQueue.id, 'completed')}
                className="px-4 py-2 bg-white text-blue-700 rounded-xl hover:bg-blue-50 transition-all font-semibold text-sm"
              >
                ✅ ตรวจเสร็จ
              </button>
            </div>
          </div>
          {nextInLine && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <span className="text-blue-200 text-sm">คิวถัดไป: </span>
              <span className="text-white font-semibold">
                #{nextInLine.queueNumber} {nextInLine.patientName}
                {nextInLine.priority === 'emergency' && ' 🚨'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          SECTION: Queue List
         ════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-600">สถานะ:</span>
            {[
              { value: 'all', label: 'ทั้งหมด' },
              { value: 'waiting', label: '⏳ รอ' },
              { value: 'in_consultation', label: '🩺 ตรวจ' },
              { value: 'on_hold', label: '⏸️ พัก' },
              { value: 'completed', label: '✅ เสร็จ' },
              { value: 'skipped', label: '⏭️ ข้าม' },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => setFilterStatus(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filterStatus === s.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600">แพทย์:</span>
            <select
              value={filterDoctor}
              onChange={(e) => setFilterDoctor(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <option value="all">ทั้งหมด</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {`${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Queue Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-semibold whitespace-nowrap w-16 text-center">คิว</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">คนไข้</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">แพทย์</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">บริการ</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">ประเภท</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">ลำดับ</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">สถานะ</th>
                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredQueues.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      {filterStatus !== 'all' ? 'ไม่พบคิวที่ตรงกับตัวกรอง' : 'ยังไม่มีคิววันนี้ — กดปุ่ม "ดึงนัดหมายวันนี้" หรือ "Walk-in" เพื่อเริ่ม'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredQueues.map((q) => (
                  <tr
                    key={q.id}
                    className={`transition-colors ${
                      q.status === 'in_consultation'
                        ? 'bg-blue-50/60'
                        : q.priority === 'emergency' && q.status === 'waiting'
                        ? 'bg-red-50/40'
                        : q.status === 'completed' || q.status === 'skipped'
                        ? 'opacity-60'
                        : 'hover:bg-gray-50/60'
                    }`}
                  >
                    {/* Queue Number */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-bold text-lg ${
                        q.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                        q.status === 'in_consultation' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {q.queueNumber}
                      </span>
                    </td>

                    {/* Patient */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{q.patientName || '-'}</div>
                      {q.notes && <div className="text-xs text-gray-400 mt-0.5 max-w-[200px] truncate">{q.notes}</div>}
                    </td>

                    {/* Doctor */}
                    <td className="px-4 py-3 whitespace-nowrap">{getDoctorName(q.doctorId)}</td>

                    {/* Service */}
                    <td className="px-4 py-3 whitespace-nowrap">{q.serviceType || '-'}</td>

                    {/* Type */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${
                        q.type === 'walk-in'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-sky-100 text-sky-700'
                      }`}>
                        {q.type === 'walk-in' ? 'Walk-in' : 'นัดหมาย'}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${PRIORITY_CONFIG[q.priority]?.color || ''}`}>
                        {PRIORITY_CONFIG[q.priority]?.icon} {PRIORITY_CONFIG[q.priority]?.label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border ${STATUS_CONFIG[q.status]?.color || ''}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[q.status]?.dotColor || ''}`} />
                        {STATUS_CONFIG[q.status]?.label}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {q.status === 'waiting' && (
                          <>
                            <button
                              onClick={() => changeQueueStatus(q.id, 'in_consultation')}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors text-xs font-semibold"
                              title="เรียกตรวจ"
                            >
                              🩺 เรียก
                            </button>
                            {q.priority !== 'emergency' && (
                              <button
                                onClick={() => setConfirmAction({ type: 'emergency', queueId: q.id })}
                                className="px-2.5 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors text-xs font-semibold"
                                title="ลัดคิว (ฉุกเฉิน)"
                              >
                                🚨
                              </button>
                            )}
                            <button
                              onClick={() => changeQueueStatus(q.id, 'on_hold')}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors text-xs font-semibold"
                              title="พักคิว"
                            >
                              ⏸️
                            </button>
                            <button
                              onClick={() => changeQueueStatus(q.id, 'skipped')}
                              className="px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-xs font-semibold"
                              title="ข้ามคิว"
                            >
                              ⏭️
                            </button>
                          </>
                        )}
                        {q.status === 'in_consultation' && (
                          <>
                            <button
                              onClick={() => changeQueueStatus(q.id, 'completed')}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors text-xs font-semibold"
                              title="ตรวจเสร็จ"
                            >
                              ✅ เสร็จ
                            </button>
                            <button
                              onClick={() => changeQueueStatus(q.id, 'on_hold')}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors text-xs font-semibold"
                              title="พักคิว"
                            >
                              ⏸️ พัก
                            </button>
                          </>
                        )}
                        {q.status === 'on_hold' && (
                          <button
                            onClick={() => changeQueueStatus(q.id, 'waiting')}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors text-xs font-semibold"
                            title="กลับเข้าคิว"
                          >
                            ▶️ กลับคิว
                          </button>
                        )}
                        {q.status === 'skipped' && (
                          <button
                            onClick={() => changeQueueStatus(q.id, 'waiting')}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors text-xs font-semibold"
                            title="กลับเข้าคิว"
                          >
                            ↩️ คืนคิว
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          MODAL: Import Appointments
         ════════════════════════════════════════════ */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowImportModal(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden animate-[scaleIn_0.2s_ease]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">ดึงนัดหมายวันนี้เข้าคิว</h2>
              <button onClick={() => setShowImportModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {importableAppointments.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg">✅ นัดหมายทั้งหมดของวันนี้ถูกนำเข้าคิวแล้ว</p>
                  <p className="text-sm mt-2">หรือไม่มีนัดหมายในวันนี้</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">พบ {importableAppointments.length} นัดหมายที่ยังไม่ได้นำเข้าคิว</p>
                    <button
                      onClick={importAllAppointments}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold transition-all disabled:opacity-50"
                    >
                      {saving ? 'กำลังนำเข้า...' : `นำเข้าทั้งหมด (${importableAppointments.length})`}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {importableAppointments.map((appt) => (
                      <div key={appt.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                        <div>
                          <div className="font-medium text-gray-900">{appt.patientName}</div>
                          <div className="text-sm text-gray-500">
                            {appt.appointmentTime} • {getDoctorName(appt.doctorId)} • {appt.serviceType}
                          </div>
                        </div>
                        <button
                          onClick={() => importAppointment(appt)}
                          disabled={saving}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs font-semibold transition-all disabled:opacity-50"
                        >
                          นำเข้าคิว
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          MODAL: Walk-in Patient
         ════════════════════════════════════════════ */}
      {showWalkInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowWalkInModal(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden animate-[scaleIn_0.2s_ease]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">เพิ่มคนไข้ Walk-in</h2>
              <button onClick={() => setShowWalkInModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddWalkIn} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Patient */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  เลือกคนไข้ <span className="text-red-500">*</span>
                </label>
                <select
                  name="patientId"
                  value={walkInForm.patientId}
                  onChange={handleWalkInChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                >
                  <option value="">เลือกคนไข้...</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.hnnumber} - {p.firstname} {p.lastname}
                    </option>
                  ))}
                </select>
              </div>

              {/* Patient Name (auto) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อคนไข้</label>
                <input
                  type="text"
                  value={walkInForm.patientName}
                  readOnly
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm"
                  placeholder="จะแสดงอัตโนมัติ"
                />
              </div>

              {/* Doctor */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  เลือกแพทย์ <span className="text-red-500">*</span>
                </label>
                <select
                  name="doctorId"
                  value={walkInForm.doctorId}
                  onChange={handleWalkInChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                >
                  <option value="">เลือกแพทย์...</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {`${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Service + Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ประเภทบริการ</label>
                  <select
                    name="serviceType"
                    value={walkInForm.serviceType}
                    onChange={handleWalkInChange}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                  >
                    {serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ระดับความเร่งด่วน</label>
                  <select
                    name="priority"
                    value={walkInForm.priority}
                    onChange={handleWalkInChange}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm"
                  >
                    <option value="normal">ปกติ</option>
                    <option value="emergency">🚨 ฉุกเฉิน (ลัดคิว)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">บันทึกเพิ่มเติม</label>
                <textarea
                  name="notes"
                  value={walkInForm.notes}
                  onChange={handleWalkInChange}
                  rows={2}
                  placeholder="อาการเบื้องต้น..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all text-sm resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWalkInModal(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 active:scale-[0.97] transition-all shadow-sm shadow-emerald-200 disabled:opacity-60"
                >
                  {saving ? 'กำลังบันทึก...' : 'เพิ่มเข้าคิว'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          MODAL: Confirm Emergency
         ════════════════════════════════════════════ */}
      {confirmAction && confirmAction.type === 'emergency' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmAction(null)} />
          <div className="relative z-20 bg-white rounded-2xl shadow-xl p-6 max-w-md w-full animate-[scaleIn_0.2s_ease]">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 mb-4">
                <span className="text-3xl">🚨</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันตั้งเป็นเคสฉุกเฉิน</h3>
              <p className="text-gray-500 text-sm mb-6">
                คิวนี้จะถูกเลื่อนขึ้นเป็นลำดับแรก (Emergency Priority)<br />
                ต้องการดำเนินการหรือไม่?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => setEmergencyPriority(confirmAction.queueId)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
                >
                  🚨 ยืนยัน ลัดคิว
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </StaffHeader>
  )
}

export default StaffQueueManagement
