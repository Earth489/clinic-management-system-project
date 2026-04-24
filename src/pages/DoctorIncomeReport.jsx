import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import DoctorHeader from '../components/DoctorHeader'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount || 0)
}

function DoctorIncomeReport() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch Paid Invoices related to this Doctor's queues
  useEffect(() => {
    if (!currentUser?.uid) return

    // Currently, invoices store data. We should find those that include this doctor's fee.
    // In our design, invoice items will have `doctorId` attached if it's a doctor's procedure.
    // However, the easiest way might be storing `doctorId` at the root of `invoices`.
    const qInv = query(
      collection(db, 'invoices'),
      where('doctorId', '==', currentUser.uid),
      where('status', '==', 'paid')
    )

    const unsub = onSnapshot(qInv, (snap) => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      console.error(err)
      // Fallback
      const qFallback = query(collection(db, 'invoices'))
      onSnapshot(qFallback, (snapFallback) => {
        const list = snapFallback.docs.map(d => ({ id: d.id, ...d.data() }))
        setInvoices(list.filter(inv => inv.doctorId === currentUser.uid && inv.status === 'paid'))
        setLoading(false)
      })
    })

    return () => unsub()
  }, [currentUser?.uid])

  // Compute Income Stats
  const { totalIncome, todayIncome, proceduresCount } = useMemo(() => {
    let tIncome = 0
    let tToday = 0
    let pCount = 0

    const todayStr = new Date().toDateString()

    invoices.forEach(inv => {
      const dbDate = inv.createdAt?.seconds 
        ? new Date(inv.createdAt.seconds * 1000).toDateString() 
        : null

      // Doctor's earnings are stored as totalDoctorFee in the invoice
      const fee = inv.totalDoctorFee || 0
      
      tIncome += fee
      if (dbDate === todayStr) tToday += fee
      pCount += (inv.items?.filter(item => item.type === 'procedure').length || 0)
    })

    return { totalIncome: tIncome, todayIncome: tToday, proceduresCount: pCount }
  }, [invoices])

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/')
    } catch (err) { }
  }

  return (
    <DoctorHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-6 md:p-8 animate-[fadeIn_0.3s_ease]">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            💰 <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600">รายงานค่าแพทย์ประจำวัน (Income)</span>
          </h1>
          <p className="text-gray-500 mt-1 text-sm">ตรวจสอบรายได้สุทธิและค่าตอบแทนจากหัตถการที่ให้บริการ เพื่อความโปร่งใส</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-200">
            <h3 className="text-emerald-100 font-semibold mb-1">รายได้วันนี้ (Today's Income)</h3>
            <div className="text-4xl font-black">{formatCurrency(todayIncome)}</div>
            <p className="text-emerald-100 text-sm mt-3 border-t border-white/20 pt-2">อัปเดตแบบเรียลไทม์จากระบบ POS หน้าเคาน์เตอร์</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-center">
             <h3 className="text-gray-500 font-semibold mb-1">รายได้สะสมทั้งหมด</h3>
             <div className="text-3xl font-black text-gray-800">{formatCurrency(totalIncome)}</div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-center">
             <h3 className="text-gray-500 font-semibold mb-1">จำนวนหัตถการที่เบิกจ่าย</h3>
             <div className="text-3xl font-black text-emerald-600">{proceduresCount} <span className="text-lg font-normal text-gray-400">รายการ</span></div>
          </div>
        </div>

        {/* Breakdown List */}
        <div className="mt-8">
          <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">ประวัติการชำระเงินที่ได้รับ / บิลคนไข้</h3>
          
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <th className="px-5 py-3 font-bold">วันที่-เวลา</th>
                  <th className="px-5 py-3 font-bold">หมายเลขเต็นท์/คิว</th>
                  <th className="px-5 py-3 font-bold">ชื่อคนไข้</th>
                  <th className="px-5 py-3 font-bold">รายการหัตถการ</th>
                  <th className="px-5 py-3 font-bold text-right">ค่าแพทย์ที่ได้รับ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.slice().sort((a,b) => b.createdAt?.seconds - a.createdAt?.seconds).map(inv => {
                  const dbDate = inv.createdAt?.seconds ? new Date(inv.createdAt.seconds * 1000).toLocaleString('th-TH') : '-'
                  const procs = inv.items?.filter(i => i.type === 'procedure') || []
                  if (procs.length === 0) return null // Hide invoices with no doctor procedures

                  return (
                    <tr key={inv.id} className="hover:bg-emerald-50/40">
                      <td className="px-5 py-4 text-gray-500">{dbDate}</td>
                      <td className="px-5 py-4 font-bold text-gray-700">Q#{inv.queueNumber}</td>
                      <td className="px-5 py-4 font-semibold text-gray-900">{inv.patientName}</td>
                      <td className="px-5 py-4 text-gray-600 text-xs">
                        {procs.map((p, idx) => (
                          <div key={idx}>• {p.name}</div>
                        ))}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-emerald-600 text-base">
                        {formatCurrency(inv.totalDoctorFee)}
                      </td>
                    </tr>
                  )
                })}
                {invoices.length === 0 && !loading && (
                  <tr><td colSpan="5" className="px-5 py-12 text-center text-gray-400">ยังไม่มีรายได้ที่รับชำระแล้วในระบบ</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DoctorHeader>
  )
}

export default DoctorIncomeReport
