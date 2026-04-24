import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import AdminHeader from '../components/AdminHeader'
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore'

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount || 0)
}

function AdminBillingManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('procedures') // 'procedures' | 'invoices'

  // Master Data: Procedures
  const [procedures, setProcedures] = useState([])
  const [searchProc, setSearchProc] = useState('')
  const [isProcModalOpen, setIsProcModalOpen] = useState(false)
  const [procFormData, setProcFormData] = useState({
    id: null,
    name: '',
    category: 'ตรวจรักษา',
    basePrice: 0,
    splitType: 'percent', // 'percent' | 'fixed'
    doctorShare: 0
  })

  // Invoices
  const [invoices, setInvoices] = useState([])
  const [searchInv, setSearchInv] = useState('')

  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // ── Fetch Data ────────────────────────────────
  useEffect(() => {
    // Fetch Procedures
    const qProc = query(collection(db, 'procedures'), orderBy('name'))
    const unsubProc = onSnapshot(qProc, (snap) => {
      setProcedures(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    }, (err) => console.error(err))

    // Fetch Invoices
    const qInv = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'))
    const unsubInv = onSnapshot(qInv, (snap) => {
      setInvoices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    }, (err) => console.error(err))

    return () => { unsubProc(); unsubInv() }
  }, [])

  // Auto-hide messages
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000)
      return () => clearTimeout(t)
    }
    if (errorMsg) {
      const t = setTimeout(() => setErrorMsg(''), 4000)
      return () => clearTimeout(t)
    }
  }, [successMsg, errorMsg])

  // ── Computed ──────────────────────────────────
  const filteredProcedures = useMemo(() => {
    if (!searchProc) return procedures
    const lower = searchProc.toLowerCase()
    return procedures.filter(p => p.name.toLowerCase().includes(lower) || p.category.toLowerCase().includes(lower))
  }, [procedures, searchProc])

  const filteredInvoices = useMemo(() => {
    if (!searchInv) return invoices
    const lower = searchInv.toLowerCase()
    return invoices.filter(inv => 
      inv.patientName?.toLowerCase().includes(lower) || 
      inv.queueNumber?.toString().includes(lower) ||
      inv.paymentMethod?.toLowerCase().includes(lower)
    )
  }, [invoices, searchInv])

  // ── Procedure Actions ─────────────────────────
  const openProcModal = (proc = null) => {
    if (proc) {
      setProcFormData({ ...proc })
    } else {
      setProcFormData({
        id: null, name: '', category: 'ตรวจรักษา', basePrice: 0, splitType: 'percent', doctorShare: 0
      })
    }
    setIsProcModalOpen(true)
  }

  const closeProcModal = () => setIsProcModalOpen(false)

  const saveProcedure = async (e) => {
    e.preventDefault()
    try {
      const dataToSave = {
        name: procFormData.name,
        category: procFormData.category,
        basePrice: Number(procFormData.basePrice),
        splitType: procFormData.splitType,
        doctorShare: Number(procFormData.doctorShare),
        updatedAt: serverTimestamp()
      }

      // Calculate Clinic Fee strictly for DB consistency, though we can calculate on fly
      let docFee = 0;
      if (procFormData.splitType === 'percent') {
        docFee = (dataToSave.basePrice * dataToSave.doctorShare) / 100
      } else {
        docFee = dataToSave.doctorShare
      }
      dataToSave.clinicFee = dataToSave.basePrice - docFee

      if (procFormData.id) {
        await updateDoc(doc(db, 'procedures', procFormData.id), dataToSave)
        setSuccessMsg('บันทึกการแก้ไขหัตถการเรียบร้อย')
      } else {
        dataToSave.createdAt = serverTimestamp()
        await addDoc(collection(db, 'procedures'), dataToSave)
        setSuccessMsg('เพิ่มหัตถการรายการใหม่เรียบร้อย')
      }
      closeProcModal()
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  const deleteProcedure = async (id) => {
    if (!confirm('ยืนยันลบข้อมูลหัตถการนี้?')) return
    try {
      await deleteDoc(doc(db, 'procedures', id))
      setSuccessMsg('ลบข้อมูลหัตถการสำเร็จ')
    } catch (err) { setErrorMsg('เกิดข้อผิดพลาด: ' + err.message) }
  }

  // ── Invoice Actions ───────────────────────────
  const handleVoidInvoice = async (invoiceId) => {
    if (!confirm('คุณแน่ใจว่าต้องการยกเลิกการชำระเงินของบิลนี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) return
    try {
      await updateDoc(doc(db, 'invoices', invoiceId), {
        status: 'void',
        voidedAt: serverTimestamp(),
        voidedBy: currentUser.uid
      })
      setSuccessMsg('ยกเลิกบิลเรียบร้อยแล้ว (Voided)')
    } catch (err) {
      setErrorMsg('ยกเลิกบิลไม่สำเร็จ: ' + err.message)
    }
  }

  const exportCSV = () => {
    if (invoices.length === 0) {
      setErrorMsg('ไม่มีข้อมูลให้ออกรายงาน')
      return
    }

    // Prepare CSV data
    const headers = ['Date', 'Queue', 'Patient', 'Method', 'Subtotal', 'Discount', 'Net Total', 'Status']
    const rows = invoices.map(inv => {
      const dbDate = inv.createdAt?.seconds ? new Date(inv.createdAt.seconds * 1000).toLocaleString('th-TH') : '-'
      return [
        dbDate,
        inv.queueNumber || '-',
        inv.patientName || '-',
        inv.paymentMethod || '-',
        inv.subtotal || 0,
        inv.discount || 0,
        inv.netTotal || 0,
        inv.status || 'paid'
      ]
    })

    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    // Add BOM for Excel UTF-8
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `clinic_sales_export_${new Date().toISOString().slice(0, 10)}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setSuccessMsg('ดาวน์โหลด CSV สำเร็จ')
  }

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/')
    } catch (err) { }
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <AdminHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-sm font-bold shadow-sm">
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm font-bold shadow-sm">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
        
        {/* Header Options */}
        <div className="bg-gradient-to-r from-slate-50 to-white px-8 py-6 border-b border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">🧾 การเรียกเก็บเงิน & รายได้</h1>
              <p className="text-slate-500 mt-1 text-sm font-medium">จัดการส่วนแบ่งรายได้แพทย์ (Revenue Split) ลบบิล และออกรายงานบัญชี</p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-xl w-max">
              <button
                onClick={() => setActiveTab('procedures')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'procedures' ? 'bg-white text-teal-700 shadow border border-slate-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                💉 โครงสร้างราคาและหัตถการ
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === 'invoices' ? 'bg-white text-teal-700 shadow border border-slate-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                📑 จัดการบิลและใบเสร็จ (Invoices)
              </button>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            TAB 1: PROCEDURES (Revenue Split)
            ════════════════════════════════════════════ */}
        {activeTab === 'procedures' && (
          <div className="animate-[fadeIn_0.2s_ease]">
            <div className="px-8 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <input
                type="text"
                placeholder="ค้นหาชื่อหัตถการ..."
                className="w-full md:w-80 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                value={searchProc}
                onChange={e => setSearchProc(e.target.value)}
              />
              <button
                onClick={() => openProcModal()}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 whitespace-nowrap"
              >
                + เพิ่มหัตถการ
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-100">
                    <th className="px-6 py-4 font-bold">ชื่อหัตถการ/บริการ</th>
                    <th className="px-6 py-4 font-bold">หมวดหมู่</th>
                    <th className="px-6 py-4 font-bold text-right">ราคาพื้นฐาน (Base Price)</th>
                    <th className="px-6 py-4 font-bold text-center">สัดส่วนแพทย์รายได้ (Doctor Split)</th>
                    <th className="px-6 py-4 font-bold text-right">คลินิกได้ (Clinic Fee)</th>
                    <th className="px-6 py-4 font-bold text-center w-24">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProcedures.map(p => {
                    const docFeePreview = p.splitType === 'percent' ? (p.basePrice * p.doctorShare) / 100 : p.doctorShare;
                    const clinicFeePreview = p.basePrice - docFeePreview;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-bold text-slate-800">{p.name}</td>
                        <td className="px-6 py-4 text-slate-500">{p.category}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-700">{formatCurrency(p.basePrice)}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-3 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs font-bold border border-teal-100">
                            {p.splitType === 'percent' ? `${p.doctorShare}% (${formatCurrency(docFeePreview)})` : `คงที่ ${formatCurrency(p.doctorShare)}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-600">{formatCurrency(clinicFeePreview)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openProcModal(p)} className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">✎</button>
                            <button onClick={() => deleteProcedure(p.id)} className="w-8 h-8 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 rounded-lg">✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredProcedures.length === 0 && (
                    <tr><td colSpan="6" className="px-6 py-10 text-center text-slate-400">ยังไม่มีข้อมูลหัตถการ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════
            TAB 2: INVOICES (Void and Export)
            ════════════════════════════════════════════ */}
        {activeTab === 'invoices' && (
          <div className="animate-[fadeIn_0.2s_ease]">
            <div className="px-8 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <input
                type="text"
                placeholder="ค้นหาชื่อคนไข้ คว หรือ วิธีชำระ..."
                className="w-full md:w-80 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-sm"
                value={searchInv}
                onChange={e => setSearchInv(e.target.value)}
              />
              <button
                onClick={exportCSV}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 whitespace-nowrap flex items-center gap-2"
              >
                📊 Export CSV Data
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-100">
                    <th className="px-6 py-4 font-bold">วันที่-เวลา</th>
                    <th className="px-6 py-4 font-bold">บิลล์ / คิวที่</th>
                    <th className="px-6 py-4 font-bold">คนไข้</th>
                    <th className="px-6 py-4 font-bold">ช่องทางชำระเงิน</th>
                    <th className="px-6 py-4 font-bold text-right">ยอดสุทธิ (Net)</th>
                    <th className="px-6 py-4 font-bold text-center">สถานะ</th>
                    <th className="px-6 py-4 font-bold text-center w-24">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map(inv => (
                    <tr key={inv.id} className={`hover:bg-slate-50/50 ${inv.status === 'void' ? 'opacity-50 blur-[0.5px] hover:blur-none' : ''}`}>
                      <td className="px-6 py-4 text-slate-500">
                        {inv.createdAt?.seconds ? new Date(inv.createdAt.seconds * 1000).toLocaleString('th-TH') : '-'}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">Q#{inv.queueNumber}</td>
                      <td className="px-6 py-4 font-semibold text-slate-800">{inv.patientName}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-bold border border-blue-100">
                          {inv.paymentMethod || 'ไม่ระบุ'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-teal-700">{formatCurrency(inv.netTotal)}</td>
                      <td className="px-6 py-4 text-center">
                        {inv.status === 'void' ? (
                          <span className="px-2.5 py-1 bg-red-100 text-red-800 rounded-md text-xs font-bold border border-red-200">VOIDED</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-bold border border-emerald-200">PAID</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => handleVoidInvoice(inv.id)} 
                          disabled={inv.status === 'void'}
                          className="px-3 py-1 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-600 rounded-lg text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ยกเลิก (Void)
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredInvoices.length === 0 && (
                    <tr><td colSpan="7" className="px-6 py-10 text-center text-slate-400">ไม่มีบิล/ใบเสร็จในระบบ</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ════════════════════════════════════════════
          MODAL: PROCEDURE / REVENUE SPLIT
          ════════════════════════════════════════════ */}
      {isProcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-xl text-slate-800">
                {procFormData.id ? 'แก้ไขข้อมูลหัตถการ' : 'เพิ่มหัตถการใหม่'}
              </h3>
              <button onClick={closeProcModal} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors">✕</button>
            </div>
            
            <form onSubmit={saveProcedure} className="p-8 space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-700 font-bold mb-2">ชื่อหัตถการ / การรักษา <span className="text-red-500">*</span></label>
                  <input required type="text" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-medium" value={procFormData.name} onChange={e => setProcFormData({...procFormData, name: e.target.value})} />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-700 font-bold mb-2">หมวดหมู่</label>
                  <select className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none bg-white font-medium" value={procFormData.category} onChange={e => setProcFormData({...procFormData, category: e.target.value})}>
                    <option>ตรวจรักษาทั่วไป</option>
                    <option>ทำแผล / เย็บแผล</option>
                    <option>เจาะเลือด / ตรวจแล็บ</option>
                    <option>ใบรับรองแพทย์</option>
                    <option>คลินิกความงาม</option>
                    <option>ทันตกรรม</option>
                    <option>อื่นๆ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-700 font-bold mb-2">ราคาพื้นฐาน (Base Price) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                    <input required type="number" className="w-full pl-8 pr-4 py-3 border border-teal-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-bold text-teal-700 bg-teal-50/30" value={procFormData.basePrice} onChange={e => setProcFormData({...procFormData, basePrice: e.target.value})} />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <h4 className="font-bold text-slate-800 mb-4 text-sm tracking-wide">โครงสร้างรายได้ส่วนแบ่งแพทย์ (Doctor Revenue Split)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-slate-500 font-bold mb-1.5">รูปแบบส่วนแบ่ง</label>
                    <select className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-semibold text-sm" value={procFormData.splitType} onChange={e => setProcFormData({...procFormData, splitType: e.target.value})}>
                      <option value="percent">เป็นเปอร์เซ็นต์ (%)</option>
                      <option value="fixed">เป็นจำนวนเงินคงที่ (บาท)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-slate-500 font-bold mb-1.5">จำนวนตามสัดส่วน</label>
                    <input type="number" required className="w-full px-4 py-2.5 border border-blue-300 rounded-lg outline-none font-bold text-blue-700 bg-blue-50" value={procFormData.doctorShare} onChange={e => setProcFormData({...procFormData, doctorShare: e.target.value})} />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3 bg-white p-2 rounded border border-slate-100">
                  {procFormData.splitType === 'percent' 
                    ? `* แพทย์จะได้รับส่วนแบ่ง ${procFormData.doctorShare}% จากราคาพื้นฐาน หรือคิดเป็นเงิน ${(procFormData.basePrice * procFormData.doctorShare / 100) || 0} บาท ต่อการทำ 1 ครั้ง`
                    : `* แพทย์จะได้รับส่วนแบ่งเป็นจำนวนเงินคงที่ ${procFormData.doctorShare || 0} บาท ต่อการทำ 1 ครั้ง และเงินที่เหลือจากการหักส่วนแบ่งจะเป็นของคลินิก`}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeProcModal} className="px-6 py-2.5 text-slate-600 bg-white border border-slate-300 rounded-xl font-bold hover:bg-slate-100 transition shadow-sm">ยกเลิก</button>
                <button type="submit" className="px-8 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition shadow-lg shadow-slate-200">
                  บันทึกข้อมูลหัตถการ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AdminHeader>
  )
}

export default AdminBillingManagement
