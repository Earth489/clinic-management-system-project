import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import DoctorHeader from '../components/DoctorHeader'
import {
  collection,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase'

// ──────────────────────────────────────────────
// Status configuration
// ──────────────────────────────────────────────
const STATUS_CONFIG = {
  waiting: {
    label: 'รอตรวจ',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    dotColor: 'bg-amber-500',
    icon: '⏳',
    cardBg: 'bg-amber-50 border-amber-200'
  },
  in_consultation: {
    label: 'กำลังตรวจ',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    dotColor: 'bg-blue-500',
    icon: '🩺',
    cardBg: 'bg-blue-50 border-blue-200'
  },
  completed: {
    label: 'ตรวจเสร็จ / รอรับยา',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotColor: 'bg-emerald-500',
    icon: '✅',
    cardBg: 'bg-emerald-50 border-emerald-200'
  },
  on_hold: {
    label: 'พักคิว',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    dotColor: 'bg-purple-500',
    icon: '⏸️',
    cardBg: 'bg-purple-50 border-purple-200'
  },
  skipped: {
    label: 'ข้ามคิว',
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    dotColor: 'bg-gray-400',
    icon: '⏭️',
    cardBg: 'bg-gray-50 border-gray-200'
  }
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function DoctorQueueManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [queues, setQueues] = useState([])
  const [successMsg, setSuccessMsg] = useState('')
  const [filterStatus, setFilterStatus] = useState('active') // 'active' | 'all' | specific status

  // Procedure Entry States
  const [allProcedures, setAllProcedures] = useState([])
  const [isProcModalOpen, setIsProcModalOpen] = useState(false)
  const [selectedProcedures, setSelectedProcedures] = useState([])

  // Medication Entry States
  const [allMedications, setAllMedications] = useState([])
  const [isMedModalOpen, setIsMedModalOpen] = useState(false)
  const [selectedMeds, setSelectedMeds] = useState([]) // { med, qty, instruction }
  const [searchMed, setSearchMed] = useState('')

  // File Upload State
  const [showFileModal, setShowFileModal] = useState(false)
  const [patientFiles, setPatientFiles] = useState([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fileType, setFileType] = useState('ผลการทดสอบ (Lab)')

  // ── Real-time listener: only MY queues ───────
  useEffect(() => {
    if (!currentUser?.uid) return

    // Listen to today's queues where doctorId matches current doctor
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

    const q = query(
      collection(db, 'queues'),
      where('doctorId', '==', currentUser.uid),
      where('queueDate', '>=', Timestamp.fromDate(start)),
      where('queueDate', '<=', Timestamp.fromDate(end))
    )

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setQueues(list)
    }, (error) => {
      console.error('Queue listener error:', error)
      // Fallback: get all queues for this doctor, filter client-side
      const qFallback = query(
        collection(db, 'queues'),
        where('doctorId', '==', currentUser.uid)
      )
      onSnapshot(qFallback, (snap) => {
        const todayStr = new Date().toDateString()
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter(q => {
            if (!q.queueDate) return false
            const qDate = q.queueDate.seconds
              ? new Date(q.queueDate.seconds * 1000).toDateString()
              : new Date(q.queueDate).toDateString()
            return qDate === todayStr
          })
        setQueues(list)
      })
    })

    const unsubProc = onSnapshot(collection(db, 'procedures'), (snap) => {
      setAllProcedures(snap.docs.map(d => ({id: d.id, ...d.data()})))
    })

    const unsubMed = onSnapshot(collection(db, 'medications'), (snap) => {
      setAllMedications(snap.docs.map(d => ({id: d.id, ...d.data()})))
    })

    return () => { unsub(); unsubProc(); unsubMed(); }
  }, [currentUser?.uid])

  // Auto-hide success
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  // ── Computed data ────────────────────────────
  const sortedQueues = useMemo(() => {
    return [...queues].sort((a, b) => {
      const statusOrder = { in_consultation: 0, waiting: 1, on_hold: 2, skipped: 3, completed: 4 }
      const aOrder = statusOrder[a.status] ?? 5
      const bOrder = statusOrder[b.status] ?? 5
      if (aOrder !== bOrder) return aOrder - bOrder
      // Emergency first
      if (a.priority === 'emergency' && b.priority !== 'emergency') return -1
      if (a.priority !== 'emergency' && b.priority === 'emergency') return 1
      return (a.queueNumber || 0) - (b.queueNumber || 0)
    })
  }, [queues])

  const filteredQueues = useMemo(() => {
    if (filterStatus === 'all') return sortedQueues
    if (filterStatus === 'active') return sortedQueues.filter(q => ['waiting', 'in_consultation', 'on_hold'].includes(q.status))
    return sortedQueues.filter(q => q.status === filterStatus)
  }, [sortedQueues, filterStatus])

  const filteredMeds = useMemo(() => {
    if (!searchMed) return allMedications
    const term = searchMed.toLowerCase()
    return allMedications.filter(m => m.name.toLowerCase().includes(term) || m.category.toLowerCase().includes(term))
  }, [allMedications, searchMed])

  const currentPatient = useMemo(() => {
    return queues.find(q => q.status === 'in_consultation') || null
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

  const stats = useMemo(() => ({
    total: queues.length,
    waiting: queues.filter(q => q.status === 'waiting').length,
    inConsultation: queues.filter(q => q.status === 'in_consultation').length,
    completed: queues.filter(q => q.status === 'completed').length,
    onHold: queues.filter(q => q.status === 'on_hold').length
  }), [queues])

  // ── Actions ──────────────────────────────────
  const changeQueueStatus = async (queueId, newStatus) => {
    if (newStatus === 'completed') {
      if (!window.confirm('คุณต้องการบันทึกว่าการตรวจเสร็จสิ้น และส่งคนไข้ไปรับยา/ชำระเงิน ใช่หรือไม่?')) {
        return
      }
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
    } catch (err) {
      console.error('Status change error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  const openProcModal = () => {
    if(currentPatient) {
      setSelectedProcedures(currentPatient.procedures || [])
      setIsProcModalOpen(true)
    }
  }

  const toggleProcedure = (proc) => {
    setSelectedProcedures(prev => {
      const exists = prev.find(p => p.id === proc.id)
      if(exists) return prev.filter(p => p.id !== proc.id)
      return [...prev, proc]
    })
  }

  const handleSaveProcedures = async () => {
    if(!currentPatient) return
    try {
      await updateDoc(doc(db, 'queues', currentPatient.id), {
        procedures: selectedProcedures,
        updatedAt: serverTimestamp()
      })
      setSuccessMsg('บันทึกรายการหัตถการเรียบร้อย')
      setIsProcModalOpen(false)
    } catch(err) {
      alert('Error: ' + err.message)
    }
  }

  // ── Medications Actions ──────────────────────
  const openMedModal = () => {
    if(currentPatient) {
      setSelectedMeds(currentPatient.medications || [])
      setIsMedModalOpen(true)
    }
  }

  const handleAddMed = (med) => {
    if (selectedMeds.find(i => i.med.id === med.id)) {
      alert('ยานี้อยู่ในรายการแล้ว')
      return
    }
    if (med.stock < 1) {
      alert('ยานี้หมดสต็อก')
      return
    }
    setSelectedMeds([...selectedMeds, { med, qty: 1, instruction: '' }])
  }

  const handleUpdateMedItem = (medId, field, value) => {
    setSelectedMeds(selectedMeds.map(i => i.med.id === medId ? { ...i, [field]: value } : i))
  }

  const handleRemoveMedItem = (medId) => {
    setSelectedMeds(selectedMeds.filter(i => i.med.id !== medId))
  }

  const handleSaveMedications = async () => {
    if(!currentPatient) return
    try {
      await updateDoc(doc(db, 'queues', currentPatient.id), {
        medications: selectedMeds,
        updatedAt: serverTimestamp()
      })
      setSuccessMsg('บันทึกการสั่งยาเรียบร้อย')
      setIsMedModalOpen(false)
    } catch(err) {
      alert('Error: ' + err.message)
    }
  }

  // ── Files & EMR ─────────────────────────────
  const openFileModal = () => {
    if (currentPatient) setShowFileModal(true)
  }

  useEffect(() => {
    if (!currentPatient || !showFileModal) return
    const q = query(collection(db, `patients/${currentPatient.patientId}/files`), orderBy('uploadedAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => setPatientFiles(snap.docs.map(d => ({id: d.id, ...d.data()}))))
    return () => unsub()
  }, [currentPatient, showFileModal])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !currentPatient) return
    setUploadingFile(true)
    try {
      const fileName = `${Date.now()}_${file.name}`
      const fileRef = ref(storage, `patients/${currentPatient.patientId}/${fileName}`)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)
      await addDoc(collection(db, `patients/${currentPatient.patientId}/files`), {
        name: file.name, path: fileRef.fullPath, url, type: fileType,
        uploadedBy: currentUser.uid, uploadedAt: serverTimestamp()
      })
      setSuccessMsg('อัปโหลดแฟ้มเวชระเบียนสำเร็จ')
    } catch (err) { alert('Upload error: ' + err.message) } finally { setUploadingFile(false); e.target.value = null }
  }

  const handleDeleteFile = async (f) => {
    if(!confirm(`ยืนยันการลบไฟล์ ${f.name}?`)) return
    try {
      await deleteObject(ref(storage, f.path)).catch(e => console.log('Storage err', e))
      await deleteDoc(doc(db, `patients/${currentPatient.patientId}/files`, f.id))
      setSuccessMsg('ลบไฟล์เรียบร้อย')
    } catch(err) { alert('Delete err: ' + err.message) }
  }

  const callNextPatient = async () => {
    if (!nextInLine) {
      alert('ไม่มีคนไข้ที่รออยู่')
      return
    }
    // Complete current patient first
    if (currentPatient) {
      await changeQueueStatus(currentPatient.id, 'completed')
    }
    await changeQueueStatus(nextInLine.id, 'in_consultation')
  }

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/')
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <DoctorHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {/* Toast */}
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
            <h1 className="text-2xl font-bold text-gray-900">🩺 คิวตรวจของฉัน</h1>
            <p className="text-gray-500 mt-1">
              {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button
            onClick={callNextPatient}
            disabled={!nextInLine}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 active:scale-[0.97] transition-all font-bold text-sm shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            เรียกคนไข้คนถัดไป
            {nextInLine && (
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                #{nextInLine.queueNumber} {nextInLine.patientName}
              </span>
            )}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-center">
            <div className="text-2xl font-bold text-gray-700">{stats.total}</div>
            <div className="text-xs text-gray-500 font-medium">ทั้งหมด</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
            <div className="text-2xl font-bold text-amber-700">{stats.waiting}</div>
            <div className="text-xs text-amber-600 font-medium">รอตรวจ</div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
            <div className="text-2xl font-bold text-blue-700">{stats.inConsultation}</div>
            <div className="text-xs text-blue-600 font-medium">กำลังตรวจ</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
            <div className="text-2xl font-bold text-emerald-700">{stats.completed}</div>
            <div className="text-xs text-emerald-600 font-medium">เสร็จแล้ว</div>
          </div>
          <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-center">
            <div className="text-2xl font-bold text-purple-700">{stats.onHold}</div>
            <div className="text-xs text-purple-600 font-medium">พักคิว</div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION: Current Patient (Hero Card)
         ════════════════════════════════════════════ */}
      {currentPatient ? (
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 rounded-2xl shadow-lg shadow-emerald-200 p-6 md:p-8 mb-6 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-5">
              <div className="flex items-center justify-center w-20 h-20 bg-white/20 rounded-2xl backdrop-blur-sm">
                <span className="text-4xl font-bold">{currentPatient.queueNumber}</span>
              </div>
              <div>
                <div className="text-emerald-200 text-sm font-semibold">🩺 กำลังตรวจอยู่</div>
                <div className="text-2xl font-bold mt-1">{currentPatient.patientName}</div>
                <div className="text-emerald-200 text-sm mt-1">
                  {currentPatient.serviceType}
                  {currentPatient.type === 'walk-in' && <span className="ml-2 px-2 py-0.5 bg-orange-400/30 rounded-full text-xs">Walk-in</span>}
                  {currentPatient.priority === 'emergency' && <span className="ml-2 px-2 py-0.5 bg-red-500/40 rounded-full text-xs font-bold">🚨 ฉุกเฉิน</span>}
                </div>
                {currentPatient.notes && (
                  <div className="text-emerald-100 text-xs mt-2">📝 {currentPatient.notes}</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <button
                onClick={openFileModal}
                className="px-5 py-2.5 bg-blue-500/80 text-white rounded-xl hover:bg-blue-600 transition-all font-semibold text-sm shadow-sm"
              >
                📁 แฟ้มประวัติ / ผลแล็บ
              </button>
              <div className="flex gap-2">
                <button
                  onClick={openProcModal}
                  className="flex-1 px-5 py-2.5 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all font-semibold text-sm shadow-sm"
                >
                  📝 หัตถการ
                </button>
                <button
                  onClick={openMedModal}
                  className="flex-1 px-5 py-2.5 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all font-semibold text-sm shadow-sm"
                >
                  💊 สั่งยา
                </button>
                <button
                  onClick={() => changeQueueStatus(currentPatient.id, 'on_hold')}
                  className="flex-1 px-5 py-2.5 bg-white/20 text-white rounded-xl hover:bg-white/30 transition-all font-semibold text-sm"
                >
                  ⏸️ พักคิว
                </button>
              </div>
              <button
                onClick={() => changeQueueStatus(currentPatient.id, 'completed')}
                className="w-full px-5 py-3 bg-white text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all font-bold text-sm shadow-lg mt-1"
              >
                ✅ สมบูรณ์ / ส่งรับยา
              </button>
            </div>
          </div>

          {/* Next in line preview */}
          {nextInLine && (
            <div className="mt-5 pt-4 border-t border-white/20 flex items-center gap-3">
              <span className="text-emerald-200 text-sm">คิวถัดไป:</span>
              <span className="px-3 py-1 bg-white/15 rounded-xl text-white text-sm font-semibold backdrop-blur-sm">
                #{nextInLine.queueNumber} {nextInLine.patientName}
                {nextInLine.priority === 'emergency' && ' 🚨'}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-r from-gray-100 to-gray-50 rounded-2xl border border-gray-200 p-8 mb-6 text-center">
          <div className="text-4xl mb-3">🩺</div>
          <h3 className="text-lg font-bold text-gray-600">ไม่มีคนไข้ที่กำลังตรวจ</h3>
          <p className="text-gray-400 text-sm mt-1">
            {nextInLine
              ? `กดปุ่ม "เรียกคนไข้คนถัดไป" เพื่อเริ่ม — คิวถัดไป: #${nextInLine.queueNumber} ${nextInLine.patientName}`
              : 'ยังไม่มีคนไข้ในคิวของคุณวันนี้'
            }
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════
          SECTION: Queue List
         ════════════════════════════════════════════ */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap mb-6">
          <span className="text-sm font-medium text-gray-600">แสดง:</span>
          {[
            { value: 'active', label: '🟢 คิวที่ยังเปิดอยู่' },
            { value: 'waiting', label: '⏳ รอตรวจ' },
            { value: 'completed', label: '✅ เสร็จแล้ว' },
            { value: 'all', label: '📋 ทั้งหมด' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === f.value
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Queue Cards */}
        {filteredQueues.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p className="text-sm">ไม่พบคิวที่ตรงกับตัวกรอง</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredQueues.map((q) => (
              <div
                key={q.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                  q.status === 'in_consultation'
                    ? 'bg-blue-50 border-blue-300 shadow-sm'
                    : q.priority === 'emergency' && q.status === 'waiting'
                    ? 'bg-red-50 border-red-200'
                    : q.status === 'completed'
                    ? 'opacity-60 border-gray-200'
                    : 'border-gray-200 hover:shadow-sm'
                }`}
              >
                {/* Left: Queue info */}
                <div className="flex items-center gap-4">
                  {/* Queue Number */}
                  <div className={`flex items-center justify-center w-12 h-12 rounded-xl font-bold text-xl ${
                    q.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                    q.status === 'in_consultation' ? 'bg-blue-100 text-blue-700' :
                    q.status === 'completed' ? 'bg-gray-100 text-gray-500' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {q.queueNumber}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{q.patientName}</span>
                      {q.priority === 'emergency' && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">🚨 ฉุกเฉิน</span>
                      )}
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        q.type === 'walk-in' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                      }`}>
                        {q.type === 'walk-in' ? 'Walk-in' : 'นัดหมาย'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {q.serviceType}
                      {q.notes && <span className="ml-2">• 📝 {q.notes}</span>}
                    </div>
                  </div>
                </div>

                {/* Right: Status + Actions */}
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border ${STATUS_CONFIG[q.status]?.color || ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[q.status]?.dotColor || ''}`} />
                    {STATUS_CONFIG[q.status]?.label}
                  </span>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {q.status === 'waiting' && (
                      <button
                        onClick={() => changeQueueStatus(q.id, 'in_consultation')}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all text-xs font-bold shadow-sm"
                      >
                        🩺 เรียกตรวจ
                      </button>
                    )}
                    {q.status === 'in_consultation' && (
                      <>
                        <button
                          onClick={() => changeQueueStatus(q.id, 'on_hold')}
                          className="px-3 py-2 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 transition-all text-xs font-semibold"
                        >
                          ⏸️ พัก
                        </button>
                        <button
                          onClick={() => changeQueueStatus(q.id, 'completed')}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all text-xs font-bold shadow-sm"
                        >
                          ✅ เสร็จ / ส่งรับยา
                        </button>
                      </>
                    )}
                    {q.status === 'on_hold' && (
                      <button
                        onClick={() => changeQueueStatus(q.id, 'waiting')}
                        className="px-4 py-2 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition-all text-xs font-semibold"
                      >
                        ▶️ กลับคิว
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════
          MODAL: PROCEDURES
          ════════════════════════════════════════════ */}
      {isProcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-bold text-xl text-gray-800">📝 บันทึกหัตถการ / บริการ</h3>
                <p className="text-sm text-gray-500 mt-1">คนไข้: {currentPatient?.patientName}</p>
              </div>
              <button onClick={() => setIsProcModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition-colors">✕</button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto w-full custom-scrollbar">
              <div className="grid grid-cols-1 gap-3">
                {allProcedures.map(proc => {
                  const isSelected = selectedProcedures.find(p => p.id === proc.id)
                  return (
                    <div 
                      key={proc.id} 
                      onClick={() => toggleProcedure(proc)}
                      className={`p-4 border rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                        isSelected ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-200 hover:border-emerald-300'
                      }`}
                    >
                      <div>
                        <div className={`font-bold ${isSelected ? 'text-emerald-800' : 'text-gray-800'}`}>{proc.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{proc.category}</div>
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300'
                      }`}>
                        {isSelected && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>
                  )
                })}
                {allProcedures.length === 0 && (
                  <div className="text-center py-10 text-gray-400">ผู้ดูแลระบบยังไม่ได้แจ้งเพิ่มบริการหัตถการในระบบ</div>
                )}
              </div>
            </div>

            <div className="px-8 py-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-3xl">
              <button type="button" onClick={() => setIsProcModalOpen(false)} className="px-6 py-2.5 text-gray-600 bg-white border border-gray-300 rounded-xl font-bold hover:bg-gray-100 transition shadow-sm">ยกเลิก</button>
              <button type="button" onClick={handleSaveProcedures} className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200">
                💾 บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          MODAL: MEDICATIONS
          ════════════════════════════════════════════ */}
      {isMedModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[80vh]">
            
            {/* Left: Med Selector */}
            <div className="w-full md:w-1/2 flex flex-col border-r border-gray-100 bg-gray-50 h-[40vh] md:h-full">
              <div className="p-5 border-b border-gray-200">
                <h3 className="font-bold text-lg text-gray-800">1. ค้นหายา</h3>
                <input type="text" placeholder="พิมพ์ชื่อยา..." className="w-full mt-3 px-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm" value={searchMed} onChange={e => setSearchMed(e.target.value)} />
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                {filteredMeds.map(med => (
                  <div key={med.id} className="flex justify-between items-center p-3 border border-gray-200 bg-white rounded-xl hover:border-blue-300">
                    <div>
                      <div className="font-bold text-gray-800 text-sm">{med.name}</div>
                      <div className="text-xs text-emerald-600 mt-0.5">คลังยา: {med.stock} {med.unit}</div>
                    </div>
                    <button onClick={() => handleAddMed(med)} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-blue-600 hover:bg-blue-50 font-bold text-lg leading-none">+</button>
                  </div>
                ))}
                {filteredMeds.length === 0 && <div className="text-center py-5 text-gray-400 text-sm">ไม่พบรายการยา</div>}
              </div>
            </div>

            {/* Right: Selected Meds */}
            <div className="w-full md:w-1/2 flex flex-col h-[40vh] md:h-full bg-white">
              <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
                <div>
                  <h3 className="font-bold text-xl text-gray-800">💊 รายการยาที่สั่ง</h3>
                  <p className="text-sm text-gray-500 mt-1">คนไข้: {currentPatient?.patientName}</p>
                </div>
                <button onClick={() => setIsMedModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition-colors">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {selectedMeds.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">ยังไม่ได้เลือกยา</div>
                ) : (
                  <div className="space-y-4">
                    {selectedMeds.map((item, idx) => (
                      <div key={item.med.id} className="p-4 border border-blue-100 bg-blue-50/30 rounded-xl">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-bold text-gray-800">{idx+1}. {item.med.name}</div>
                          <button onClick={() => handleRemoveMedItem(item.med.id)} className="text-red-400 hover:text-red-600 text-sm font-bold">✕ ลบ</button>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm font-medium text-gray-600">จำนวน:</span>
                          <input type="number" className="w-20 px-3 py-1 border border-gray-300 rounded-lg text-center font-bold outline-none" min="1" max={item.med.stock} value={item.qty} onChange={(e) => handleUpdateMedItem(item.med.id, 'qty', e.target.value)} />
                          <span className="text-sm text-gray-500">{item.med.unit}</span>
                        </div>
                        <input type="text" placeholder="วิธีใช้ (เช่น ครั้งละ 1 เม็ด หลังอาหาร 3 เวลา)" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none" value={item.instruction} onChange={e => handleUpdateMedItem(item.med.id, 'instruction', e.target.value)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-white">
                <button type="button" onClick={() => setIsMedModalOpen(false)} className="px-6 py-2.5 text-gray-600 bg-white border border-gray-300 rounded-xl font-bold hover:bg-gray-100 transition shadow-sm">ยกเลิก</button>
                <button type="button" onClick={handleSaveMedications} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
                  💾 บันทึกการสั่งยา
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          MODAL: EMR FILES (แฟ้มประวัติ / ผลแล็บ)
          ════════════════════════════════════════════ */}
      {showFileModal && currentPatient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-[fadeIn_0.2s_ease]">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col">
            <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-blue-50">
              <div>
                <h3 className="font-bold text-xl text-blue-900 flex items-center gap-2">📁 แฟ้มเวชระเบียน / ผลแล็บ (EMR)</h3>
                <p className="text-sm text-blue-600 mt-1">คนไข้: {currentPatient?.patientName}</p>
              </div>
              <button onClick={() => setShowFileModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-200 text-blue-700 transition">✕</button>
            </div>
            
            <div className="p-6">
              {/* Uploader (Doctor specific types) */}
              <div className="flex flex-col md:flex-row gap-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-inner">
                <select 
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  value={fileType} onChange={e => setFileType(e.target.value)} disabled={uploadingFile}
                >
                  <option>ผลการทดสอบ (Lab)</option>
                  <option>ฟิล์มเอ็กซเรย์ (X-Ray)</option>
                  <option>แบบบันทึกการรักษา (Note)</option>
                  <option>ใบนำส่งตัว (Referral)</option>
                  <option>เอกสารทั่วไป</option>
                  <option>รูปภาพ Before/After</option>
                </select>
                <div className="relative flex-1">
                  <input type="file" id="doctor-file-upload" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} accept="image/*,.pdf,.doc,.docx" />
                  <label htmlFor="doctor-file-upload" className={`cursor-pointer flex items-center justify-center gap-2 w-full py-2 bg-blue-600 text-white font-bold rounded-lg transition-all shadow-md ${uploadingFile ? 'opacity-50 pointer-events-none' : 'hover:bg-blue-700 active:scale-95'}`}>
                    {uploadingFile ? 'กำลังอัปโหลด...' : '+ แนบเอกสาร/ผลแล็บใหม่'}
                  </label>
                </div>
              </div>

              {/* Grid of files */}
              <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {patientFiles.length === 0 ? (
                     <div className="col-span-1 md:col-span-2 text-center py-10 text-gray-400">ยังไม่มีเอกสารแนบในแฟ้มผู้ป่วยนี้</div>
                  ) : (
                    patientFiles.map(f => (
                      <div key={f.id} className="border border-gray-200 rounded-xl p-3 flex flex-col hover:shadow-md transition bg-white group hover:border-blue-300">
                        <div className="flex justify-between items-start mb-2">
                           <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                             f.type.includes('Lab') ? 'bg-purple-100 text-purple-700' :
                             f.type.includes('X-Ray') ? 'bg-cyan-100 text-cyan-700' :
                             f.type.includes('Note') ? 'bg-amber-100 text-amber-700' :
                             f.type.includes('Before/After') ? 'bg-pink-100 text-pink-700' :
                             'bg-gray-100 text-gray-600'
                           }`}>{f.type}</span>
                           <button onClick={() => handleDeleteFile(f)} className="text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-600 transition" title="ลบไฟล์">✕</button>
                        </div>
                        <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 min-h-[70px] flex items-center gap-3">
                           {f.name.match(/\.(jpeg|jpg|gif|png)$/i) ? (
                             <div className="w-16 h-16 rounded-lg bg-gray-100 bg-cover bg-center border border-gray-200 shadow-sm" style={{backgroundImage: `url(${f.url})`}}></div>
                           ) : (
                             <div className="w-16 h-16 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center text-2xl font-black shrink-0 border border-blue-100">📄</div>
                           )}
                           <div className="overflow-hidden">
                             <p className="text-sm font-bold text-gray-800 truncate" title={f.name}>{f.name}</p>
                             <p className="text-xs text-gray-500 mt-1">{f.uploadedAt?.seconds ? new Date(f.uploadedAt.seconds*1000).toLocaleString('th-TH') : '-'}</p>
                           </div>
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </DoctorHeader>
  )
}

export default DoctorQueueManagement
