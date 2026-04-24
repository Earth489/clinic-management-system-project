import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import StaffHeader from '../components/StaffHeader'
import {
  collection,
  onSnapshot,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore'

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount || 0)
}

function StaffPOSBilling() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  // ── States ──────────────────────────────────
  const [queues, setQueues] = useState([])
  const [selectedQueue, setSelectedQueue] = useState(null)
  
  // Bill Details
  const [meds, setMeds] = useState([])
  const [procedures, setProcedures] = useState([])
  
  const [paymentMethod, setPaymentMethod] = useState('เงินสด')
  const [processState, setProcessState] = useState('idle') // idle | processing | success
  const [invoiceId, setInvoiceId] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  // ── Subscriptions ────────────────────────────
  useEffect(() => {
    // 1. Listen to Queues that are ready for billing (completed from doctor)
    const today = new Date().toDateString()
    const qQueues = query(collection(db, 'queues'))
    const unsubQueues = onSnapshot(qQueues, (snap) => {
      const allQ = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const bilableQueues = allQ.filter(q => {
        if (!q.queueDate) return false
        const qDate = q.queueDate.seconds ? new Date(q.queueDate.seconds * 1000).toDateString() : new Date(q.queueDate).toDateString()
        return qDate === today && (q.status === 'completed') // 'billed' means already checked out
      })
      setQueues(bilableQueues)
      
      // Update selected queue if it changed
      if (selectedQueue) {
        const updated = bilableQueues.find(x => x.id === selectedQueue.id)
        if (updated) setSelectedQueue(updated)
      }
    }, (err) => console.error(err))

    return () => unsubQueues()
  }, []) // Remove selectedQueue from deps to avoid infinite reload loop

  // Fetch Meds whenever a queue is selected
  useEffect(() => {
    if (!selectedQueue) {
      setMeds([])
      setProcedures([])
      return
    }

    const fetchDetails = async () => {
      try {
        // 1. Fetch Medications from pharmacy logs for this queue
        const qLogs = query(collection(db, 'pharmacy_logs'), where('queueId', '==', selectedQueue.id))
        const logSnaps = await getDocs(qLogs)
        let _meds = []
        logSnaps.forEach(doc => {
          const data = doc.data()
          if (data.items) {
            _meds = [..._meds, ...data.items]
          }
        })

        // Fallback: If no pharmacy log exists (not dispensed yet), use the doctor's prescription directly
        if (_meds.length === 0 && selectedQueue.medications) {
          _meds = selectedQueue.medications.map(item => ({
            name: item.med.name,
            quantity: Number(item.qty),
            price: item.med.price,
            subtotal: Number(item.qty) * (item.med.price || 0),
            unit: item.med.unit
          }))
        }

        setMeds(_meds)

        // 2. Procedures are stored inside the queue doc by the Doctor
        setProcedures(selectedQueue.procedures || [])
        setErrorMsg('')
        setProcessState('idle')
      } catch (err) {
        setErrorMsg('โหลดข้อมูลบิลล้มเหลว: ' + err.message)
      }
    }
    fetchDetails()
  }, [selectedQueue])

  useEffect(() => { if (errorMsg) { const t=setTimeout(()=>setErrorMsg(''),4000); return ()=>clearTimeout(t) } }, [errorMsg])

  // ── Computed ────────────────────────────────
  const totals = useMemo(() => {
    const medNet = meds.reduce((sum, item) => sum + (item.subtotal || 0), 0)
    const procNet = procedures.reduce((sum, item) => sum + (item.basePrice || 0), 0)
    let totalDoctorFee = 0
    procedures.forEach(p => {
      let docFee = p.splitType === 'percent' ? (p.basePrice * p.doctorShare) / 100 : p.doctorShare
      totalDoctorFee += docFee
    })

    return { medNet, procNet, totalDoctorFee, netTotal: medNet + procNet + 150 } // +150 for Base Service Fee example
  }, [meds, procedures])

  // ── Actions ─────────────────────────────────
  const processCheckout = async () => {
    if (!selectedQueue) return

    if (!window.confirm('คุณได้รับเงินจากคนไข้เรียบร้อยแล้ว และต้องการยืนยันการออกใบเสร็จใช่หรือไม่?\n\n(เมื่อยืนยันแล้วจะไม่สามารถกลับมาแก้ไขบิลนี้ได้อีก)')) {
      return
    }

    setProcessState('processing')
    try {
      // Create comprehensive invoice items list
      const items = [
        // Clinic basic service fee
        { type: 'service_fee', name: 'ค่าบริการทางการแพทย์ / Clinic Fee', quantity: 1, price: 150, subtotal: 150 }
      ]

      // Add medications
      meds.forEach(m => {
        items.push({ type: 'medication', name: m.name, quantity: m.quantity, price: m.price, subtotal: m.subtotal, unit: m.unit })
      })

      // Add procedures
      procedures.forEach(p => {
        items.push({
          type: 'procedure', name: p.name, quantity: 1, price: p.basePrice, subtotal: p.basePrice,
          doctorShare: p.doctorShare, splitType: p.splitType, doctorId: selectedQueue.doctorId // for reporting
        })
      })

      const invoiceData = {
        queueId: selectedQueue.id,
        queueNumber: selectedQueue.queueNumber,
        patientId: selectedQueue.patientId, // Added for medical records query
        patientName: selectedQueue.patientName,
        doctorId: selectedQueue.doctorId, // Used for quick querying
        items,
        subtotal: totals.netTotal,
        netTotal: totals.netTotal, // without discount
        totalDoctorFee: totals.totalDoctorFee,
        paymentMethod,
        status: 'paid', // Mark as paid
        billedBy: currentUser.uid,
        createdAt: serverTimestamp()
      }

      // Add to invoices
      const invRef = await addDoc(collection(db, 'invoices'), invoiceData)
      setInvoiceId(invRef.id)

      // Mark queue as billed and store netTotal directly for fast Medical Records display
      await updateDoc(doc(db, 'queues', selectedQueue.id), { 
        status: 'billed', 
        billedAt: serverTimestamp(),
        netTotal: totals.netTotal 
      })

      setProcessState('success')
    } catch(err) {
      setErrorMsg('เกิดข้อผิดพลาด: ' + err.message)
      setProcessState('idle')
    }
  }

  const resetTarget = () => {
    setSelectedQueue(null)
    setMeds([])
    setProcedures([])
    setInvoiceId(null)
    setProcessState('idle')
  }

  const handleLogout = async () => {
    try { await logout(); navigate('/') } catch(err) {}
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <StaffHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-bold animate-[fadeIn_0.3s_ease]">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8 print:bg-transparent print:border-none print:shadow-none print:p-0">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🧾 จุดชำระเงิน (Billing & POS)</h1>
            <p className="text-gray-500 mt-1 text-sm">รวมบิลอัตโนมัติจากห้องตรวจและห้องจัดยา (ไม่อนุญาตให้แก้ไขราคายา/แพทย์)</p>
          </div>
        </div>

        {processState === 'success' ? (
          <div className="flex flex-col items-center justify-center py-10 animate-[fadeIn_0.4s_ease]">
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-white text-3xl shadow-lg mb-4 shadow-emerald-200 print:hidden">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-xl font-black text-emerald-800 mb-6 print:hidden">ชำระเงินเรียบร้อยแล้ว</h2>
            
            {/* ── Receipt Slip Preview ── */}
            <div className="bg-white p-8 border border-gray-200 shadow-sm rounded-none w-full max-w-sm mb-8 print:w-full print:max-w-none print:border-none print:shadow-none print:p-0 relative font-mono text-sm text-gray-800">
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold mb-1">คลินิกเวชกรรม</h1>
                <p className="text-xs text-gray-500">123 ถ.สุขุมวิท กรุงเทพฯ 10110</p>
                <p className="text-xs text-gray-500 mb-2">โทร: 02-xxx-xxxx</p>
                <div className="text-lg font-bold border-y border-dashed border-gray-300 py-2">ใบเสร็จรับเงิน</div>
              </div>

              <div className="mb-4 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>เลขที่ (No.):</span>
                  <span className="font-semibold">{invoiceId}</span>
                </div>
                <div className="flex justify-between">
                  <span>วันที่ (Date):</span>
                  <span>{new Date().toLocaleString('th-TH')}</span>
                </div>
                <div className="flex justify-between">
                  <span>คนไข้ (Patient):</span>
                  <span>{selectedQueue?.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span>ผู้รับเงิน (Cashier):</span>
                  <span>{currentUser?.email || 'Staff'}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-300 pt-2 pb-2 mb-2">
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="w-1/2">รายการ</span>
                  <span className="w-1/6 text-center">จำนวน</span>
                  <span className="w-1/3 text-right">ราคา</span>
                </div>
                
                {/* Clinic Fee */}
                <div className="flex justify-between text-xs mb-1">
                  <span className="w-1/2 truncate">ค่าบริการคลินิก</span>
                  <span className="w-1/6 text-center">1</span>
                  <span className="w-1/3 text-right">150.00</span>
                </div>

                {/* Procedures */}
                {procedures.map((p, idx) => (
                  <div key={`rec-proc-${idx}`} className="flex justify-between text-xs mb-1">
                    <span className="w-1/2 truncate">{p.name}</span>
                    <span className="w-1/6 text-center">1</span>
                    <span className="w-1/3 text-right">{p.basePrice.toFixed(2)}</span>
                  </div>
                ))}

                {/* Medications */}
                {meds.map((m, idx) => (
                  <div key={`rec-med-${idx}`} className="flex justify-between text-xs mb-1">
                    <span className="w-1/2 truncate">{m.name}</span>
                    <span className="w-1/6 text-center">{m.quantity}</span>
                    <span className="w-1/3 text-right">{(m.subtotal || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-gray-300 pt-2 mb-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>รวมเป็นเงิน:</span>
                  <span>{formatCurrency(totals.netTotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>ยอดสุทธิ (Net Total):</span>
                  <span className="text-lg">{formatCurrency(totals.netTotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 pt-2">
                  <span>วิธีชำระเงิน:</span>
                  <span>{paymentMethod}</span>
                </div>
              </div>

              <div className="text-center text-xs text-gray-500 mt-6 pb-2 border-b-2 border-gray-800 border-dashed">
                <p>ขอบคุณที่ใช้บริการ</p>
                <p>Please come again</p>
              </div>
            </div>
            
            <div className="flex gap-4 print:hidden">
               <button onClick={resetTarget} className="px-6 py-3 bg-white text-emerald-700 rounded-xl font-bold border border-emerald-200 shadow-sm hover:bg-emerald-100 transition">คิดเงินคิวถัดไป</button>
               <button onClick={() => window.print()} className="px-8 py-3 bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-xl font-bold shadow-lg shadow-gray-300 transition">🖨️ พิมพ์ใบเสร็จ</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Select Queue */}
            <div className="lg:col-span-1 border-r border-gray-100 pr-0 lg:pr-8">
              <h3 className="font-bold text-gray-800 mb-4 text-lg">1. เลือกใบนำทาง (คนไข้)</h3>
              
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {queues.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                     <p className="text-gray-400 font-medium">ไม่มีคิวที่รอชำระเงิน</p>
                  </div>
                ) : (
                  queues.map(q => (
                    <button
                      key={q.id}
                      onClick={() => setSelectedQueue(q)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedQueue?.id === q.id 
                          ? 'bg-blue-50 border-blue-300 shadow-sm ring-2 ring-blue-500/20' 
                          : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-black text-lg ${selectedQueue?.id === q.id ? 'text-blue-700' : 'text-gray-900'}`}>{q.queueNumber}</span>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-bold">{q.priority==='emergency'?'ฉุกเฉิน':'ปกติ'}</span>
                      </div>
                      <div className="font-semibold text-gray-800">{q.patientName}</div>
                      <div className="text-xs text-gray-400 mt-1 truncate">จากห้องตรวจ: แพทย์ที่ดูแล</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right Column: Checkout Summary */}
            <div className={`lg:col-span-2 transition-all duration-300 ${!selectedQueue ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
              <h3 className="font-bold text-gray-800 mb-4 text-lg">2. สรุปยอดและชำระเงิน</h3>
              
              <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-inner">
                {/* Header Bill */}
                <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center">
                   <div>
                     <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-0.5">บิลเรียกเก็บเงิน คนไข้</div>
                     <div className="font-bold text-lg">{selectedQueue ? `${selectedQueue.patientName} (Q#${selectedQueue.queueNumber})` : '-'}</div>
                   </div>
                   <div className="text-right">
                     <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-0.5">วันที่</div>
                     <div className="font-bold">{new Date().toLocaleDateString('th-TH')}</div>
                   </div>
                </div>

                {/* Items List */}
                <div className="p-6 bg-white min-h-[300px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-100 text-gray-400 uppercase text-xs font-bold tracking-wider text-left">
                        <th className="py-3 pb-2 w-2/3">รายการ (Items)</th>
                        <th className="py-3 pb-2 w-1/6 text-center">จำนวน</th>
                        <th className="py-3 pb-2 w-1/6 text-right">รวม (THB)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-gray-700">
                      
                      {/* Clinic Fee Fixed */}
                      <tr className="hover:bg-gray-50">
                        <td className="py-4 font-semibold text-blue-700">ค่าบริการคลินิก (Clinic Service Fee)</td>
                        <td className="py-4 text-center">1</td>
                        <td className="py-4 text-right font-bold">150.00</td>
                      </tr>

                      {/* Procedures */}
                      {procedures.map((p, idx) => (
                        <tr key={`proc-${idx}`} className="hover:bg-gray-50">
                          <td className="py-4">
                            <div className="font-semibold text-emerald-700">{p.name}</div>
                            <div className="text-xs text-gray-400 italic">หัตถการ/ค่าแพทย์</div>
                          </td>
                          <td className="py-4 text-center">1</td>
                          <td className="py-4 text-right font-bold">{formatCurrency(p.basePrice).replace('฿','')}</td>
                        </tr>
                      ))}

                      {/* Medications */}
                      {meds.map((m, idx) => (
                        <tr key={`med-${idx}`} className="hover:bg-gray-50">
                          <td className="py-4">
                            <div className="font-medium text-gray-800">{m.name}</div>
                            <div className="text-xs text-gray-400 italic">{formatCurrency(m.price)} / {m.unit}</div>
                          </td>
                          <td className="py-4 text-center">{m.quantity}</td>
                          <td className="py-4 text-right font-bold">{formatCurrency(m.subtotal).replace('฿','')}</td>
                        </tr>
                      ))}

                      {(!procedures.length && !meds.length && selectedQueue) && (
                        <tr><td colSpan="3" className="py-8 text-center text-gray-400">ยังไม่มีรายการค่าใช้จ่ายอื่น ๆ แจ้งเข้าสู่ระบบ</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Footer Totals */}
                <div className="bg-gray-100 p-6 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-6">
                    <div className="text-gray-500 font-bold uppercase tracking-wider">ยอดการชำระสุทธิ (Net Total)</div>
                    <div className="text-4xl font-black text-emerald-600">{formatCurrency(totals.netTotal)}</div>
                  </div>

                  {/* Payment Methods */}
                  <div className="mb-6">
                     <p className="text-xs font-bold text-gray-500 uppercase mb-2 text-center">เลือกวิธีชำระเงิน</p>
                     <div className="flex gap-2">
                       {['เงินสด', 'โอนเงิน (QR Cash)', 'บัตรเครดิต', 'ประกันสังคม'].map(method => (
                         <button
                           key={method}
                           onClick={() => setPaymentMethod(method)}
                           className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                             paymentMethod === method ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-200' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                           }`}
                         >
                           {method}
                         </button>
                       ))}
                     </div>
                  </div>

                  <button
                    onClick={processCheckout}
                    disabled={!selectedQueue || processState === 'processing'}
                    className="w-full py-4 bg-gray-900 text-white rounded-xl font-black text-lg hover:bg-gray-800 transition shadow-lg shadow-gray-200 disabled:opacity-50"
                  >
                    {processState === 'processing' ? 'กำลังดำเนินการ...' : '✓ ยืนยันรับเงินและออกใบเสร็จ'}
                  </button>
                  <p className="text-center text-xs text-gray-400 mt-3">*ข้อมูลการเงินถูกดึงจากมาสเตอร์โดยตรง แก้ไขราคาไม่ได้พลการ</p>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </StaffHeader>
  )
}

export default StaffPOSBilling
