import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import AdminHeader from '../components/AdminHeader'
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  updateDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore'

const DAY_NAMES = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const DEFAULT_CLINIC_HOURS = {
  mon: { open: true, start: '09:00', end: '17:00' },
  tue: { open: true, start: '09:00', end: '17:00' },
  wed: { open: true, start: '09:00', end: '17:00' },
  thu: { open: true, start: '09:00', end: '17:00' },
  fri: { open: true, start: '09:00', end: '17:00' },
  sat: { open: true, start: '09:00', end: '12:00' },
  sun: { open: false, start: '09:00', end: '12:00' }
}

const DEFAULT_QUEUE_SETTINGS = {
  slotDuration: 30, // minutes per slot
  maxQueuePerDoctor: 20,
  autoImportAppointments: true
}

// ──────────────────────────────────────────────
function AdminClinicSettings() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [clinicHours, setClinicHours] = useState(DEFAULT_CLINIC_HOURS)
  const [queueSettings, setQueueSettings] = useState(DEFAULT_QUEUE_SETTINGS)
  const [doctors, setDoctors] = useState([])
  const [doctorSchedules, setDoctorSchedules] = useState({}) // { doctorId: { mon: true, tue: true, ... } }
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [logoutMsg, setLogoutMsg] = useState('')
  const [activeTab, setActiveTab] = useState('hours') // 'hours' | 'queue' | 'doctors'

  // ── Load settings ────────────────────────────
  useEffect(() => {
    // Clinic hours
    const loadSettings = async () => {
      try {
        const hoursDoc = await getDoc(doc(db, 'settings', 'clinicHours'))
        if (hoursDoc.exists()) setClinicHours(hoursDoc.data().hours || DEFAULT_CLINIC_HOURS)

        const queueDoc = await getDoc(doc(db, 'settings', 'queueSettings'))
        if (queueDoc.exists()) setQueueSettings(queueDoc.data())
      } catch (err) {
        console.error('Load settings error:', err)
      }
    }
    loadSettings()

    // Doctors
    const qDoctors = query(collection(db, 'users'), where('role', '==', 'doctor'))
    const unsub = onSnapshot(qDoctors, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => `${a.firstName || ''}`.localeCompare(`${b.firstName || ''}`))
      setDoctors(list)

      // Load each doctor's schedule
      list.forEach(async (doctor) => {
        try {
          const schedDoc = await getDoc(doc(db, 'doctorSchedules', doctor.id))
          if (schedDoc.exists()) {
            setDoctorSchedules(prev => ({ ...prev, [doctor.id]: schedDoc.data().workDays || {} }))
          } else {
            // Default: work on all open clinic days
            const defaultDays = {}
            DAY_KEYS.forEach(day => { defaultDays[day] = true })
            setDoctorSchedules(prev => ({ ...prev, [doctor.id]: defaultDays }))
          }
        } catch (err) {
          console.error('Load doctor schedule error:', err)
        }
      })
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    if (successMsg) { const t = setTimeout(() => setSuccessMsg(''), 3000); return () => clearTimeout(t) }
  }, [successMsg])

  // ── Save handlers ────────────────────────────
  const saveClinicHours = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'clinicHours'), { hours: clinicHours, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid })
      setSuccessMsg('บันทึกเวลาทำการสำเร็จ')
    } catch (err) { alert('Error: ' + err.message) } finally { setSaving(false) }
  }

  const saveQueueSettings = async () => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'queueSettings'), { ...queueSettings, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid })
      setSuccessMsg('บันทึกตั้งค่าคิวสำเร็จ')
    } catch (err) { alert('Error: ' + err.message) } finally { setSaving(false) }
  }

  const saveDoctorSchedule = async (doctorId) => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'doctorSchedules', doctorId), { workDays: doctorSchedules[doctorId] || {}, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid })
      setSuccessMsg('บันทึกตารางแพทย์สำเร็จ')
    } catch (err) { alert('Error: ' + err.message) } finally { setSaving(false) }
  }

  const saveAllDoctorSchedules = async () => {
    setSaving(true)
    try {
      for (const doctor of doctors) {
        await setDoc(doc(db, 'doctorSchedules', doctor.id), { workDays: doctorSchedules[doctor.id] || {}, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid })
      }
      setSuccessMsg('บันทึกตารางแพทย์ทั้งหมดสำเร็จ')
    } catch (err) { alert('Error: ' + err.message) } finally { setSaving(false) }
  }

  const handleLogout = async () => {
    try {
      setLogoutMsg('กำลังออกจากระบบ...'); await logout()
      setLogoutMsg('ออกจากระบบสำเร็จ'); setTimeout(() => navigate('/'), 800)
    } catch (err) { alert('Error: ' + err.message); setLogoutMsg('') }
  }

  const getDoctorName = (d) => `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <AdminHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {logoutMsg && <div className="mb-4 px-5 py-3 bg-teal-500/20 border border-teal-500/50 text-teal-100 rounded-xl text-sm font-medium">{logoutMsg}</div>}
      {successMsg && <div className="mb-4 px-5 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium">✅ {successMsg}</div>}

      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">ADMIN</span>
            <h1 className="text-2xl font-bold text-gray-900">⚙️ ตั้งค่าคลินิก</h1>
          </div>
          <p className="text-gray-500 text-sm">เวลาทำการ • ตารางเข้าเวร • ระยะเวลาคิวตรวจ</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 pb-3">
          {[
            { key: 'hours', label: '🕐 เวลาทำการ' },
            { key: 'queue', label: '⏱️ ตั้งค่าคิว' },
            { key: 'doctors', label: '👨‍⚕️ ตารางเข้าเวรแพทย์' }
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.key ? 'bg-teal-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ Tab: Clinic Hours ═══ */}
        {activeTab === 'hours' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">เวลาทำการคลินิก</h2>
            <p className="text-sm text-gray-500 mb-6">กำหนดวันและเวลาที่คลินิกเปิดทำการ — Staff จะไม่สามารถนัดหมายในวัน/เวลาที่คลินิกปิดได้</p>

            <div className="space-y-3">
              {DAY_KEYS.map((dayKey, i) => (
                <div key={dayKey} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${clinicHours[dayKey]?.open ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                  {/* Toggle */}
                  <label className="flex items-center gap-3 cursor-pointer min-w-[140px]">
                    <input type="checkbox" checked={clinicHours[dayKey]?.open || false}
                      onChange={(e) => setClinicHours(prev => ({ ...prev, [dayKey]: { ...prev[dayKey], open: e.target.checked } }))}
                      className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    <span className="text-sm font-semibold text-gray-700">{DAY_NAMES[i]}</span>
                  </label>

                  {clinicHours[dayKey]?.open && (
                    <div className="flex items-center gap-2">
                      <input type="time" value={clinicHours[dayKey]?.start || '09:00'}
                        onChange={(e) => setClinicHours(prev => ({ ...prev, [dayKey]: { ...prev[dayKey], start: e.target.value } }))}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      <span className="text-gray-400">ถึง</span>
                      <input type="time" value={clinicHours[dayKey]?.end || '17:00'}
                        onChange={(e) => setClinicHours(prev => ({ ...prev, [dayKey]: { ...prev[dayKey], end: e.target.value } }))}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  )}

                  {!clinicHours[dayKey]?.open && (
                    <span className="text-sm text-gray-400 italic">ปิดทำการ</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-6">
              <button onClick={saveClinicHours} disabled={saving}
                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 transition-all">
                {saving ? 'กำลังบันทึก...' : '💾 บันทึกเวลาทำการ'}
              </button>
            </div>
          </div>
        )}

        {/* ═══ Tab: Queue Settings ═══ */}
        {activeTab === 'queue' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">ตั้งค่าระบบคิว</h2>
            <p className="text-sm text-gray-500 mb-6">กำหนดระยะเวลาเฉลี่ยต่อ 1 คิว เพื่อให้ Logic การตรวจสอบเวลาที่ทับซ้อนทำงานได้แม่นยำ</p>

            <div className="space-y-6 max-w-lg">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">ระยะเวลาเฉลี่ยต่อ 1 สล็อต (นาที)</label>
                <div className="flex items-center gap-3">
                  {[15, 20, 30, 45, 60].map(mins => (
                    <button key={mins} onClick={() => setQueueSettings(prev => ({ ...prev, slotDuration: mins }))}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                        queueSettings.slotDuration === mins ? 'bg-teal-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {mins} นาที
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">ปัจจุบัน: {queueSettings.slotDuration} นาที/สล็อต — ใช้ในการคำนวณ Time Overlap</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">จำนวนคิวสูงสุดต่อแพทย์/วัน</label>
                <input type="number" value={queueSettings.maxQueuePerDoctor}
                  onChange={(e) => setQueueSettings(prev => ({ ...prev, maxQueuePerDoctor: parseInt(e.target.value) || 20 }))}
                  className="w-32 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500/40" min="1" max="100" />
                <p className="text-xs text-gray-400 mt-1">ป้องกันการนัดหมายเกินจำนวนที่แพทย์รับได้</p>
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={queueSettings.autoImportAppointments}
                    onChange={(e) => setQueueSettings(prev => ({ ...prev, autoImportAppointments: e.target.checked }))}
                    className="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                  <div>
                    <span className="text-sm font-semibold text-gray-700">นำเข้านัดหมายอัตโนมัติ</span>
                    <p className="text-xs text-gray-400">ดึงนัดหมายของวันนี้เข้าคิวอัตโนมัติเมื่อเปิดระบบคิว</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button onClick={saveQueueSettings} disabled={saving}
                className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 transition-all">
                {saving ? 'กำลังบันทึก...' : '💾 บันทึกตั้งค่าคิว'}
              </button>
            </div>
          </div>
        )}

        {/* ═══ Tab: Doctor Schedules ═══ */}
        {activeTab === 'doctors' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">ตารางเข้าเวรแพทย์</h2>
                <p className="text-sm text-gray-500 mt-1">กำหนดวันทำงานของแพทย์ — Staff จะไม่สามารถนัดหมายในวันที่แพทย์หยุดได้</p>
              </div>
              <button onClick={saveAllDoctorSchedules} disabled={saving}
                className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 disabled:opacity-60 transition-all">
                {saving ? 'กำลังบันทึก...' : '💾 บันทึกทั้งหมด'}
              </button>
            </div>

            {doctors.length === 0 ? (
              <div className="text-center py-12 text-gray-400">ไม่พบแพทย์ในระบบ</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 font-semibold text-left text-gray-700 sticky left-0 bg-gray-50">แพทย์</th>
                      {DAY_NAMES.map((day, i) => (
                        <th key={i} className="px-4 py-3 font-semibold text-center text-gray-700 min-w-[80px]">
                          {day}
                          {clinicHours[DAY_KEYS[i]]?.open === false && (
                            <div className="text-[10px] text-red-400 font-normal">(คลินิกปิด)</div>
                          )}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-semibold text-center text-gray-700">บันทึก</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {doctors.map(doctor => (
                      <tr key={doctor.id} className="hover:bg-gray-50/40">
                        <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white whitespace-nowrap">
                          👨‍⚕️ {getDoctorName(doctor)}
                        </td>
                        {DAY_KEYS.map((dayKey, i) => {
                          const clinicOpen = clinicHours[dayKey]?.open !== false
                          const doctorWork = doctorSchedules[doctor.id]?.[dayKey] || false
                          return (
                            <td key={dayKey} className="px-4 py-3 text-center">
                              <label className="cursor-pointer">
                                <input type="checkbox" checked={doctorWork} disabled={!clinicOpen}
                                  onChange={(e) => {
                                    setDoctorSchedules(prev => ({
                                      ...prev,
                                      [doctor.id]: { ...prev[doctor.id], [dayKey]: e.target.checked }
                                    }))
                                  }}
                                  className={`w-5 h-5 rounded border-gray-300 focus:ring-teal-500 ${clinicOpen ? 'text-teal-600' : 'text-gray-300 cursor-not-allowed'}`}
                                />
                              </label>
                            </td>
                          )
                        })}
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => saveDoctorSchedule(doctor.id)} disabled={saving}
                            className="px-3 py-1 bg-teal-100 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-200 disabled:opacity-50">
                            💾
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminHeader>
  )
}

export default AdminClinicSettings
