import { useState, useEffect, useMemo } from 'react'
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
  Timestamp
} from 'firebase/firestore'

// ──────────────────────────────────────────────
// Status / Priority config
// ──────────────────────────────────────────────
const STATUS_CONFIG = {
  waiting:          { label: 'รอตรวจ',       color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  in_consultation:  { label: 'กำลังตรวจ',     color: 'bg-blue-100 text-blue-800 border-blue-200',   dot: 'bg-blue-500' },
  completed:        { label: 'ตรวจเสร็จ',     color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  on_hold:          { label: 'พักคิว',        color: 'bg-purple-100 text-purple-800 border-purple-200', dot: 'bg-purple-500' },
  skipped:          { label: 'ข้ามคิว',       color: 'bg-gray-100 text-gray-600 border-gray-200',   dot: 'bg-gray-400' }
}

const serviceTypes = ['ตรวจทั่วไป', 'ติดตามอาการ', 'รับผลเลือด', 'ฉีดวัคซีน', 'ปรึกษา']

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function AdminQueueManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [queues, setQueues] = useState([])
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [appointments, setAppointments] = useState([])

  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDoctor, setFilterDoctor] = useState('all')
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overrideQueue, setOverrideQueue] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [logoutMsg, setLogoutMsg] = useState('')

  // Override form
  const [overrideForm, setOverrideForm] = useState({ status: '', priority: '', queueNumber: '', doctorId: '', notes: '' })

  // Add Walk-in form
  const [addForm, setAddForm] = useState({ patientId: '', patientName: '', doctorId: '', serviceType: 'ตรวจทั่วไป', priority: 'normal', notes: '' })

  // ── Real-time listeners ──────────────────────
  useEffect(() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

    // Queues — try with date filter, fallback to all
    const qQueues = query(
      collection(db, 'queues'),
      where('queueDate', '>=', Timestamp.fromDate(start)),
      where('queueDate', '<=', Timestamp.fromDate(end)),
      orderBy('queueDate', 'asc')
    )
    const unsubQueues = onSnapshot(qQueues, (snap) => {
      setQueues(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {
      const qFallback = query(collection(db, 'queues'), orderBy('createdAt', 'desc'))
      onSnapshot(qFallback, (snap) => {
        const todayStr = new Date().toDateString()
        setQueues(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => {
          if (!q.queueDate) return false
          return new Date(q.queueDate.seconds ? q.queueDate.seconds * 1000 : q.queueDate).toDateString() === todayStr
        }))
      })
    })

    const unsubPatients = onSnapshot(query(collection(db, 'patients'), orderBy('firstname')), (snap) => {
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })

    const unsubDoctors = onSnapshot(query(collection(db, 'users'), where('role', '==', 'doctor')), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => `${a.firstName || ''}`.localeCompare(`${b.firstName || ''}`))
      setDoctors(list)
    })

    const unsubAppts = onSnapshot(query(collection(db, 'appointments'), where('status', 'in', ['scheduled', 'confirmed'])), (snap) => {
      const todayStr = new Date().toDateString()
      setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => {
        if (!a.appointmentDate) return false
        return new Date(a.appointmentDate.seconds * 1000).toDateString() === todayStr
      }))
    })

    return () => { unsubQueues(); unsubPatients(); unsubDoctors(); unsubAppts() }
  }, [])

  useEffect(() => {
    if (successMsg) { const t = setTimeout(() => setSuccessMsg(''), 3000); return () => clearTimeout(t) }
  }, [successMsg])

  // ── Computed ─────────────────────────────────
  const getDoctorName = (id) => {
    const d = doctors.find(x => x.id === id)
    return d ? `${d.firstName || ''} ${d.lastName || ''}`.trim() : '-'
  }

  const getNextQueueNumber = () => {
    if (queues.length === 0) return 1
    return Math.max(...queues.map(q => q.queueNumber || 0)) + 1
  }

  const importedIds = useMemo(() => new Set(queues.filter(q => q.appointmentId).map(q => q.appointmentId)), [queues])
  const importable = useMemo(() => appointments.filter(a => !importedIds.has(a.id)), [appointments, importedIds])

  const sortedQueues = useMemo(() => {
    return [...queues].sort((a, b) => {
      const so = { in_consultation: 0, waiting: 1, on_hold: 2, skipped: 3, completed: 4 }
      if ((so[a.status] ?? 5) !== (so[b.status] ?? 5)) return (so[a.status] ?? 5) - (so[b.status] ?? 5)
      if (a.priority === 'emergency' && b.priority !== 'emergency') return -1
      if (a.priority !== 'emergency' && b.priority === 'emergency') return 1
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
    emergency: queues.filter(q => q.priority === 'emergency' && q.status === 'waiting').length
  }), [queues])

  // ── Actions ──────────────────────────────────
  const handleLogout = async () => {
    try {
      setLogoutMsg('กำลังออกจากระบบ...'); await logout()
      setLogoutMsg('ออกจากระบบสำเร็จ'); setTimeout(() => navigate('/'), 800)
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); setLogoutMsg('') }
  }

  const changeStatus = async (queueId, newStatus) => {
    try {
      const data = { status: newStatus, updatedAt: serverTimestamp() }
      if (newStatus === 'in_consultation') data.calledAt = serverTimestamp()
      if (newStatus === 'completed') data.completedAt = serverTimestamp()
      await updateDoc(doc(db, 'queues', queueId), data)
      setSuccessMsg(`อัปเดตสถานะเป็น "${STATUS_CONFIG[newStatus].label}" สำเร็จ`)
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) }
  }

  const deleteQueue = async (queueId) => {
    try {
      await deleteDoc(doc(db, 'queues', queueId))
      setSuccessMsg('ลบคิวสำเร็จ'); setDeleteConfirm(null)
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) }
  }

  // Override
  const openOverride = (q) => {
    setOverrideQueue(q)
    setOverrideForm({ status: q.status, priority: q.priority || 'normal', queueNumber: q.queueNumber || '', doctorId: q.doctorId || '', notes: q.notes || '' })
    setShowOverrideModal(true)
  }

  const handleOverride = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const data = {
        status: overrideForm.status,
        priority: overrideForm.priority,
        queueNumber: parseInt(overrideForm.queueNumber) || overrideQueue.queueNumber,
        doctorId: overrideForm.doctorId,
        notes: overrideForm.notes,
        updatedAt: serverTimestamp(),
        overriddenBy: currentUser?.uid || null,
        overriddenAt: serverTimestamp()
      }
      if (overrideForm.status === 'in_consultation') data.calledAt = serverTimestamp()
      if (overrideForm.status === 'completed') data.completedAt = serverTimestamp()
      await updateDoc(doc(db, 'queues', overrideQueue.id), data)
      setSuccessMsg('🔧 Override คิวสำเร็จ')
      setShowOverrideModal(false)
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) } finally { setSaving(false) }
  }

  // Import all
  const importAll = async () => {
    if (importable.length === 0) return; setSaving(true)
    try {
      let num = getNextQueueNumber()
      for (const appt of importable) {
        await addDoc(collection(db, 'queues'), {
          queueNumber: num++, patientId: appt.patientId || '', patientName: appt.patientName || '',
          doctorId: appt.doctorId || '', type: 'appointment', appointmentId: appt.id,
          priority: 'normal', status: 'waiting', serviceType: appt.serviceType || 'ตรวจทั่วไป',
          notes: appt.notes || '', queueDate: Timestamp.fromDate(new Date()),
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(), calledAt: null, completedAt: null
        })
      }
      setSuccessMsg(`นำเข้า ${importable.length} นัดหมายเข้าคิวสำเร็จ`)
      setShowImportModal(false)
    } catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) } finally { setSaving(false) }
  }

  const importOne = async (appt) => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'queues'), {
        queueNumber: getNextQueueNumber(), patientId: appt.patientId || '', patientName: appt.patientName || '',
        doctorId: appt.doctorId || '', type: 'appointment', appointmentId: appt.id,
        priority: 'normal', status: 'waiting', serviceType: appt.serviceType || 'ตรวจทั่วไป',
        notes: appt.notes || '', queueDate: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), calledAt: null, completedAt: null
      })
      setSuccessMsg(`เพิ่มคิว ${appt.patientName} สำเร็จ`)
    } catch (err) { alert('Error: ' + err.message) } finally { setSaving(false) }
  }

  // Add walk-in
  const handleAddWalkIn = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await addDoc(collection(db, 'queues'), {
        queueNumber: getNextQueueNumber(), patientId: addForm.patientId, patientName: addForm.patientName,
        doctorId: addForm.doctorId, type: 'walk-in', appointmentId: null,
        priority: addForm.priority, status: 'waiting', serviceType: addForm.serviceType,
        notes: addForm.notes, queueDate: Timestamp.fromDate(new Date()),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(), calledAt: null, completedAt: null
      })
      setSuccessMsg(`เพิ่ม Walk-in ${addForm.patientName} สำเร็จ`)
      setShowAddModal(false)
      setAddForm({ patientId: '', patientName: '', doctorId: '', serviceType: 'ตรวจทั่วไป', priority: 'normal', notes: '' })
    } catch (err) { alert('Error: ' + err.message) } finally { setSaving(false) }
  }

  const handleAddChange = (e) => {
    const { name, value } = e.target
    setAddForm(prev => ({ ...prev, [name]: value }))
    if (name === 'patientId') {
      const p = patients.find(x => x.id === value)
      if (p) setAddForm(prev => ({ ...prev, patientName: `${p.firstname} ${p.lastname}`.trim() }))
    }
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <AdminHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {logoutMsg && <div className="mb-4 px-5 py-3 bg-teal-500/20 border border-teal-500/50 text-teal-100 rounded-xl text-sm font-medium">{logoutMsg}</div>}
      {successMsg && <div className="mb-4 px-5 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">✅ {successMsg}</div>}

      {/* ═══ Header + Stats ═══ */}
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">ADMIN</span>
              <h1 className="text-2xl font-bold text-gray-900">คิวตรวจวันนี้</h1>
            </div>
            <p className="text-gray-500 text-sm">
              {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              <span className="ml-2 text-gray-400">• สิทธิ์ Override ทุกคิว</span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold text-sm transition-all">
              📥 ดึงนัดหมาย {importable.length > 0 && <span className="px-1.5 py-0.5 bg-white/30 rounded-full text-xs">{importable.length}</span>}
            </button>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold text-sm transition-all">
              ➕ Walk-in
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { l: 'ทั้งหมด', v: stats.total, c: 'bg-gray-50 text-gray-700 border-gray-200' },
            { l: 'รอตรวจ', v: stats.waiting, c: 'bg-amber-50 text-amber-700 border-amber-200' },
            { l: 'ตรวจอยู่', v: stats.inConsultation, c: 'bg-blue-50 text-blue-700 border-blue-200' },
            { l: 'เสร็จ', v: stats.completed, c: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            { l: 'พักคิว', v: stats.onHold, c: 'bg-purple-50 text-purple-700 border-purple-200' },
            { l: 'ฉุกเฉิน', v: stats.emergency, c: 'bg-red-50 text-red-700 border-red-200' },
          ].map(s => (
            <div key={s.l} className={`p-3 rounded-xl border ${s.c} text-center`}>
              <div className="text-2xl font-bold">{s.v}</div>
              <div className="text-xs font-medium mt-0.5">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Queue Table ═══ */}
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-600">สถานะ:</span>
            {[
              { v: 'all', l: 'ทั้งหมด' }, { v: 'waiting', l: '⏳ รอ' }, { v: 'in_consultation', l: '🩺 ตรวจ' },
              { v: 'on_hold', l: '⏸️ พัก' }, { v: 'completed', l: '✅ เสร็จ' }, { v: 'skipped', l: '⏭️ ข้าม' }
            ].map(f => (
              <button key={f.v} onClick={() => setFilterStatus(f.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterStatus === f.v ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {f.l}
              </button>
            ))}
          </div>
          <select value={filterDoctor} onChange={(e) => setFilterDoctor(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
            <option value="all">แพทย์ทั้งหมด</option>
            {doctors.map(d => <option key={d.id} value={d.id}>{getDoctorName(d.id)}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-semibold text-center w-16">คิว</th>
                <th className="px-4 py-3 font-semibold">คนไข้</th>
                <th className="px-4 py-3 font-semibold">แพทย์</th>
                <th className="px-4 py-3 font-semibold">บริการ</th>
                <th className="px-4 py-3 font-semibold">ประเภท</th>
                <th className="px-4 py-3 font-semibold">ลำดับ</th>
                <th className="px-4 py-3 font-semibold">สถานะ</th>
                <th className="px-4 py-3 font-semibold text-center">จัดการ (Admin)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredQueues.length === 0 ? (
                <tr><td colSpan="8" className="px-4 py-12 text-center text-gray-400">ไม่พบคิว — กด "ดึงนัดหมาย" หรือ "Walk-in"</td></tr>
              ) : (
                filteredQueues.map(q => (
                  <tr key={q.id} className={`transition-colors ${
                    q.status === 'in_consultation' ? 'bg-blue-50/60' :
                    q.priority === 'emergency' && q.status === 'waiting' ? 'bg-red-50/40' :
                    q.status === 'completed' || q.status === 'skipped' ? 'opacity-60' : 'hover:bg-gray-50/60'
                  }`}>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl font-bold text-lg ${
                        q.priority === 'emergency' ? 'bg-red-100 text-red-700' : q.status === 'in_consultation' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                      }`}>{q.queueNumber}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{q.patientName || '-'}</div>
                      {q.notes && <div className="text-xs text-gray-400 truncate max-w-[180px]">{q.notes}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{getDoctorName(q.doctorId)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{q.serviceType || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${q.type === 'walk-in' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'}`}>
                        {q.type === 'walk-in' ? 'Walk-in' : 'นัดหมาย'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${q.priority === 'emergency' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                        {q.priority === 'emergency' ? '🚨 ฉุกเฉิน' : 'ปกติ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border ${STATUS_CONFIG[q.status]?.color || ''}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[q.status]?.dot || ''}`} />
                        {STATUS_CONFIG[q.status]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {/* Quick status buttons */}
                        {q.status === 'waiting' && (
                          <>
                            <button onClick={() => changeStatus(q.id, 'in_consultation')} className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-semibold">🩺</button>
                            <button onClick={() => changeStatus(q.id, 'skipped')} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-semibold">⏭️</button>
                          </>
                        )}
                        {q.status === 'in_consultation' && (
                          <button onClick={() => changeStatus(q.id, 'completed')} className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-semibold">✅</button>
                        )}
                        {(q.status === 'on_hold' || q.status === 'skipped') && (
                          <button onClick={() => changeStatus(q.id, 'waiting')} className="px-2 py-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-semibold">↩️</button>
                        )}
                        {/* Override */}
                        <button onClick={() => openOverride(q)}
                          className="px-2 py-1 rounded-lg bg-teal-100 text-teal-700 hover:bg-teal-200 text-xs font-bold" title="Admin Override">
                          🔧
                        </button>
                        {/* Delete */}
                        <button onClick={() => setDeleteConfirm(q.id)}
                          className="px-2 py-1 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-semibold" title="ลบคิว">
                          🗑️
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

      {/* ═══ Override Modal ═══ */}
      {showOverrideModal && overrideQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowOverrideModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-red-50 to-orange-50">
              <div>
                <h2 className="text-lg font-bold text-gray-900">🔧 Admin Override</h2>
                <p className="text-xs text-gray-500">แก้ไขข้อมูลคิวด้วยสิทธิ์ Superuser</p>
              </div>
              <button onClick={() => setShowOverrideModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">✕</button>
            </div>
            <form onSubmit={handleOverride} className="p-6 space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="text-sm text-gray-500">คิว #{overrideQueue.queueNumber} — <strong>{overrideQueue.patientName}</strong></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">สถานะ</label>
                  <select value={overrideForm.status} onChange={(e) => setOverrideForm(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                    <option value="waiting">รอตรวจ</option><option value="in_consultation">กำลังตรวจ</option>
                    <option value="completed">เสร็จ</option><option value="on_hold">พักคิว</option><option value="skipped">ข้ามคิว</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ลำดับความเร่งด่วน</label>
                  <select value={overrideForm.priority} onChange={(e) => setOverrideForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                    <option value="normal">ปกติ</option><option value="emergency">🚨 ฉุกเฉิน</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">เลขคิว</label>
                  <input type="number" value={overrideForm.queueNumber}
                    onChange={(e) => setOverrideForm(prev => ({ ...prev, queueNumber: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" min="1" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">เปลี่ยนแพทย์</label>
                  <select value={overrideForm.doctorId} onChange={(e) => setOverrideForm(prev => ({ ...prev, doctorId: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                    <option value="">เลือกแพทย์...</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>{getDoctorName(d.id)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ Admin</label>
                <textarea value={overrideForm.notes} onChange={(e) => setOverrideForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" placeholder="เหตุผลที่ Override..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowOverrideModal(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">ยกเลิก</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-60">
                  {saving ? 'กำลังบันทึก...' : '🔧 บันทึก Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ Import Modal ═══ */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowImportModal(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">📥 ดึงนัดหมายวันนี้เข้าคิว</h2>
              <button onClick={() => setShowImportModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">✕</button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {importable.length === 0 ? (
                <div className="text-center py-8 text-gray-400">✅ ทุกนัดหมายถูกนำเข้าแล้ว</div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">พบ {importable.length} นัดหมายที่ยังไม่ได้นำเข้า</p>
                    <button onClick={importAll} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                      {saving ? 'กำลังนำเข้า...' : `นำเข้าทั้งหมด (${importable.length})`}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {importable.map(appt => (
                      <div key={appt.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:bg-gray-50">
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{appt.patientName}</div>
                          <div className="text-xs text-gray-500">{appt.appointmentTime} • {getDoctorName(appt.doctorId)} • {appt.serviceType}</div>
                        </div>
                        <button onClick={() => importOne(appt)} disabled={saving} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-200 disabled:opacity-50">นำเข้า</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end px-6 py-4 border-t bg-gray-50">
              <button onClick={() => setShowImportModal(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Walk-in Modal ═══ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-emerald-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">➕ เพิ่ม Walk-in (Admin)</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">✕</button>
            </div>
            <form onSubmit={handleAddWalkIn} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">คนไข้ <span className="text-red-500">*</span></label>
                <select name="patientId" value={addForm.patientId} onChange={handleAddChange} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                  <option value="">เลือก...</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.hnnumber} - {p.firstname} {p.lastname}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ชื่อคนไข้</label>
                <input type="text" value={addForm.patientName} readOnly className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">แพทย์ <span className="text-red-500">*</span></label>
                <select name="doctorId" value={addForm.doctorId} onChange={handleAddChange} required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                  <option value="">เลือก...</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{getDoctorName(d.id)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">บริการ</label>
                  <select name="serviceType" value={addForm.serviceType} onChange={handleAddChange} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                    {serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ความเร่งด่วน</label>
                  <select name="priority" value={addForm.priority} onChange={handleAddChange} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm">
                    <option value="normal">ปกติ</option><option value="emergency">🚨 ฉุกเฉิน</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ</label>
                <textarea name="notes" value={addForm.notes} onChange={handleAddChange} rows={2} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">ยกเลิก</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-60">{saving ? 'กำลังบันทึก...' : 'เพิ่มเข้าคิว'}</button>
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
            <h3 className="text-lg font-bold text-gray-900 mb-2">ลบคิวนี้?</h3>
            <p className="text-gray-500 text-sm mb-6">การลบไม่สามารถกู้คืนได้ (Admin Only)</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">ยกเลิก</button>
              <button onClick={() => deleteQueue(deleteConfirm)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700">ลบ</button>
            </div>
          </div>
        </div>
      )}
    </AdminHeader>
  )
}

export default AdminQueueManagement
