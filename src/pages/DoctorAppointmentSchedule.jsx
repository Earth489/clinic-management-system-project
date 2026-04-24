import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import DoctorHeader from '../components/DoctorHeader'
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy
} from 'firebase/firestore'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

const STATUS_CONFIG = {
  scheduled: { label: 'นัดแล้ว', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  confirmed: { label: 'ยืนยัน', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  completed: { label: 'เสร็จ', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function DoctorAppointmentSchedule() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [appointments, setAppointments] = useState([])
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [viewMode, setViewMode] = useState('calendar') // 'calendar' | 'list'

  // ── Load only MY appointments ────────────────
  useEffect(() => {
    if (!currentUser?.uid) return

    const q = query(
      collection(db, 'appointments'),
      where('doctorId', '==', currentUser.uid),
      orderBy('appointmentDate', 'desc')
    )

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      setAppointments(list)
    }, (error) => {
      console.error('Appointments listener error:', error)
      // Fallback without index
      const qFallback = query(
        collection(db, 'appointments'),
        where('doctorId', '==', currentUser.uid)
      )
      onSnapshot(qFallback, (snap) => {
        setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      })
    })

    return () => unsub()
  }, [currentUser?.uid])

  // ── Computed ─────────────────────────────────
  const appointmentsByDate = useMemo(() => {
    const map = {}
    appointments.forEach(appt => {
      if (!appt.appointmentDate) return
      const date = new Date(appt.appointmentDate.seconds * 1000)
      const key = date.toISOString().split('T')[0]
      if (!map[key]) map[key] = []
      map[key].push(appt)
    })
    // Sort each day by time
    Object.values(map).forEach(dayAppts => {
      dayAppts.sort((a, b) => (a.appointmentTime || '').localeCompare(b.appointmentTime || ''))
    })
    return map
  }, [appointments])

  const selectedDayAppointments = useMemo(() => {
    return appointmentsByDate[selectedDate] || []
  }, [appointmentsByDate, selectedDate])

  const todayStr = new Date().toISOString().split('T')[0]

  const todayAppointments = useMemo(() => {
    return appointmentsByDate[todayStr] || []
  }, [appointmentsByDate, todayStr])

  const upcomingCount = useMemo(() => {
    return appointments.filter(a => {
      if (!a.appointmentDate) return false
      const d = new Date(a.appointmentDate.seconds * 1000)
      return d >= new Date(new Date().setHours(0, 0, 0, 0)) &&
             ['scheduled', 'confirmed'].includes(a.status)
    }).length
  }, [appointments])

  // ── Calendar navigation ─────────────────────
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(y => y - 1)
    } else {
      setCurrentMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(y => y + 1)
    } else {
      setCurrentMonth(m => m + 1)
    }
  }

  const goToToday = () => {
    const now = new Date()
    setCurrentMonth(now.getMonth())
    setCurrentYear(now.getFullYear())
    setSelectedDate(todayStr)
  }

  // ── Calendar grid ───────────────────────────
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth)
    const firstDay = getFirstDayOfWeek(currentYear, currentMonth)
    const days = []

    // Empty slots for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({
        day: d,
        dateStr,
        appointments: appointmentsByDate[dateStr] || [],
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate
      })
    }
    return days
  }, [currentYear, currentMonth, appointmentsByDate, todayStr, selectedDate])

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
      {/* ── Header ──────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📅 ตารางนัดหมายของฉัน</h1>
            <p className="text-gray-500 mt-1">My Schedule — ดูนัดหมายเฉพาะของตัวเอง</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                viewMode === 'calendar' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📅 ปฏิทิน
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                viewMode === 'list' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📋 รายการ
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-center">
            <div className="text-2xl font-bold text-blue-700">{todayAppointments.length}</div>
            <div className="text-xs text-blue-600 font-medium">นัดวันนี้</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
            <div className="text-2xl font-bold text-emerald-700">{upcomingCount}</div>
            <div className="text-xs text-emerald-600 font-medium">นัดที่กำลังจะมา</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
            <div className="text-2xl font-bold text-amber-700">{selectedDayAppointments.length}</div>
            <div className="text-xs text-amber-600 font-medium">นัดในวันที่เลือก</div>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-center">
            <div className="text-2xl font-bold text-gray-700">{appointments.length}</div>
            <div className="text-xs text-gray-600 font-medium">นัดทั้งหมด</div>
          </div>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        /* ════════════════════════════════════════════
           CALENDAR VIEW
          ════════════════════════════════════════════ */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            {/* Month Nav */}
            <div className="flex items-center justify-between mb-6">
              <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-gray-900">
                  {MONTH_NAMES[currentMonth]} {currentYear + 543}
                </h2>
                <button
                  onClick={goToToday}
                  className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-200 transition-colors"
                >
                  วันนี้
                </button>
              </div>
              <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAY_NAMES.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">{day}</div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) => (
                <div key={i}>
                  {cell === null ? (
                    <div className="h-20" />
                  ) : (
                    <button
                      onClick={() => setSelectedDate(cell.dateStr)}
                      className={`w-full h-20 p-1.5 rounded-xl text-left transition-all relative ${
                        cell.isSelected
                          ? 'bg-emerald-100 border-2 border-emerald-500 shadow-sm'
                          : cell.isToday
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <div className={`text-sm font-semibold ${
                        cell.isSelected ? 'text-emerald-700' : cell.isToday ? 'text-blue-700' : 'text-gray-700'
                      }`}>
                        {cell.day}
                      </div>
                      {cell.appointments.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {cell.appointments.slice(0, 3).map((appt, j) => (
                            <span
                              key={j}
                              className={`w-2 h-2 rounded-full ${STATUS_CONFIG[appt.status]?.dot || 'bg-gray-400'}`}
                              title={`${appt.appointmentTime} - ${appt.patientName}`}
                            />
                          ))}
                          {cell.appointments.length > 3 && (
                            <span className="text-[10px] text-gray-400 font-medium">+{cell.appointments.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Selected Day Detail */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {selectedDayAppointments.length} นัดหมาย
            </p>

            {selectedDayAppointments.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">ไม่มีนัดหมายในวันนี้</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDayAppointments.map((appt) => (
                  <div key={appt.id} className="p-4 rounded-xl border border-gray-200 hover:shadow-sm transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-emerald-700">{appt.appointmentTime || '--:--'}</span>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_CONFIG[appt.status]?.color || ''}`}>
                        {STATUS_CONFIG[appt.status]?.label}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-gray-900">{appt.patientName || '-'}</div>
                    <div className="text-xs text-gray-500 mt-1">{appt.serviceType}</div>
                    {appt.notes && (
                      <div className="text-xs text-gray-400 mt-1 truncate">📝 {appt.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ════════════════════════════════════════════
           LIST VIEW
          ════════════════════════════════════════════ */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">รายการนัดหมายทั้งหมด</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-4 py-3 font-semibold">วันที่</th>
                  <th className="px-4 py-3 font-semibold">เวลา</th>
                  <th className="px-4 py-3 font-semibold">คนไข้</th>
                  <th className="px-4 py-3 font-semibold">บริการ</th>
                  <th className="px-4 py-3 font-semibold">สถานะ</th>
                  <th className="px-4 py-3 font-semibold">บันทึก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-12 text-center text-gray-400">
                      ยังไม่มีนัดหมาย
                    </td>
                  </tr>
                ) : (
                  appointments.map(appt => (
                    <tr key={appt.id} className="hover:bg-emerald-50/40 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {appt.appointmentDate
                          ? new Date(appt.appointmentDate.seconds * 1000).toLocaleDateString('th-TH')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">{appt.appointmentTime || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{appt.patientName || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{appt.serviceType || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_CONFIG[appt.status]?.color || ''}`}>
                          {STATUS_CONFIG[appt.status]?.label || appt.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">{appt.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DoctorHeader>
  )
}

export default DoctorAppointmentSchedule
