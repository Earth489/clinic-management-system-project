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
  orderBy,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount || 0)
}

function StaffPharmacyManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  // ── States ──────────────────────────────────
  const [activeTab, setActiveTab] = useState('inventory') // 'inventory' | 'dispense'
  const [medications, setMedications] = useState([])
  const [queues, setQueues] = useState([]) // For dispensing to patients
  const [searchQuery, setSearchQuery] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Inventory Modal State
  const [isInvModalOpen, setIsInvModalOpen] = useState(false)
  const [invFormData, setInvFormData] = useState({
    id: null,
    name: '',
    category: 'ยาเม็ด',
    description: '',
    stock: 0,
    unit: 'เม็ด',
    price: 0,
    reorderPoint: 20
  })

  // Dispense State
  const [selectedQueue, setSelectedQueue] = useState(null)
  const [dispenseItems, setDispenseItems] = useState([]) // Array of { medId, med, quantity, price, subtotal }
  const [isDispensing, setIsDispensing] = useState(false)

  // ── Subscriptions ────────────────────────────
  useEffect(() => {
    // 1. Listen to Medications
    const qMeds = query(collection(db, 'medications'), orderBy('name'))
    const unsubMeds = onSnapshot(qMeds, (snap) => {
      setMedications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    }, (err) => console.error(err))

    return () => unsubMeds()
  }, [])

  useEffect(() => {
    // 2. Listen to Queues (Waiting for meds / completed consultation)
    // We fetch today's queues that are 'completed' (i.e. finished from doctor)
    const today = new Date().toDateString()
    const unsubQueues = onSnapshot(collection(db, 'queues'), (snap) => {
      const allQ = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      const todayQ = allQ.filter(q => {
        if (!q.queueDate) return false
        const qDate = q.queueDate.seconds
          ? new Date(q.queueDate.seconds * 1000).toDateString()
          : new Date(q.queueDate).toDateString()
        return qDate === today && (q.status === 'completed' || q.status === 'in_consultation' || q.status === 'waiting') && !q.isDispensed
      })
      // Sort by complete (highest priority for dispensing), then current, then waiting
      todayQ.sort((a, b) => {
        const order = { 'completed': 1, 'in_consultation': 2, 'waiting': 3 }
        return (order[a.status] || 99) - (order[b.status] || 99)
      })
      setQueues(todayQ)
    }, (err) => console.error(err))

    return () => unsubQueues()
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

  // ── Computed ────────────────────────────────
  const lowStockMeds = useMemo(() => {
    return medications.filter(m => m.stock <= (m.reorderPoint || 0))
  }, [medications])

  const filteredMeds = useMemo(() => {
    if (!searchQuery) return medications
    const lowerQuery = searchQuery.toLowerCase()
    return medications.filter(m =>
      m.name.toLowerCase().includes(lowerQuery) ||
      m.category.toLowerCase().includes(lowerQuery)
    )
  }, [medications, searchQuery])

  const dispenseTotal = useMemo(() => {
    return dispenseItems.reduce((sum, item) => sum + item.subtotal, 0)
  }, [dispenseItems])

  // ── Actions: Inventory ───────────────────────
  const openInvModal = (med = null) => {
    if (med) {
      setInvFormData({ ...med })
    } else {
      setInvFormData({
        id: null, name: '', category: 'ยาเม็ด', description: '',
        stock: 0, unit: 'เม็ด', price: 0, reorderPoint: 20
      })
    }
    setIsInvModalOpen(true)
  }

  const closeInvModal = () => {
    setIsInvModalOpen(false)
  }

  const saveInventory = async (e) => {
    e.preventDefault()
    try {
      const data = {
        name: invFormData.name,
        category: invFormData.category,
        description: invFormData.description || '',
        stock: Number(invFormData.stock),
        unit: invFormData.unit,
        price: Number(invFormData.price),
        reorderPoint: Number(invFormData.reorderPoint),
        updatedAt: serverTimestamp()
      }

      if (invFormData.id) {
        await updateDoc(doc(db, 'medications', invFormData.id), data)
        setSuccessMsg('อัปเดตข้อมูลยาสำเร็จ')
      } else {
        data.createdAt = serverTimestamp()
        await addDoc(collection(db, 'medications'), data)
        setSuccessMsg('เพิ่มยารายการใหม่เข้าคลังสำเร็จ')
      }
      closeInvModal()
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // ── Actions: Dispense ────────────────────────
  const addDispenseItem = (med) => {
    // Check if already added
    if (dispenseItems.find(i => i.medId === med.id)) {
      setErrorMsg('เพิ่มรายการยานี้ไปแล้ว กรุณาปรับจำนวนแทน')
      return
    }
    if (med.stock < 1) {
      setErrorMsg('สินค้านี้หมดสต็อก ชั่วคราว (Stock = 0)')
      return
    }
    setDispenseItems([...dispenseItems, {
      medId: med.id,
      med: med,
      quantity: 1,
      price: med.price,
      subtotal: med.price * 1
    }])
  }

  const updateDispenseItemQty = (medId, qty) => {
    const qtyNum = Number(qty)
    const item = dispenseItems.find(i => i.medId === medId)
    if (!item) return

    if (qtyNum < 1) return // Min 1
    if (qtyNum > item.med.stock) {
      setErrorMsg(`มียาในสต็อกสูงสุดเพียง ${item.med.stock} ${item.med.unit}`)
      return
    }

    setDispenseItems(dispenseItems.map(i => {
      if (i.medId === medId) {
        return { ...i, quantity: qtyNum, subtotal: qtyNum * i.price }
      }
      return i
    }))
  }

  const removeDispenseItem = (medId) => {
    setDispenseItems(dispenseItems.filter(i => i.medId !== medId))
  }

  const handleDispense = async () => {
    if (!selectedQueue) {
      setErrorMsg('กรุณาเลือกคนไข้ (คิว) ที่ต้องการจัดยา')
      return
    }
    if (dispenseItems.length === 0) {
      setErrorMsg('กรุณาเพิ่มรายการยาอย่างน้อย 1 รายการ')
      return
    }

    if (!window.confirm('คุณต้องการยืนยันการจ่ายยาและหักสต็อกใช่หรือไม่?\n\n(เมื่อยืนยันแล้วจะไม่สามารถแก้ไขหรือจ่ายยาซ้ำให้คิวนี้ได้อีก)')) {
      return
    }

    if (isDispensing) return

    setIsDispensing(true)
    try {
      // Create a Transaction to deduct stock safely and log prescription
      await runTransaction(db, async (transaction) => {
        // Read Phase
        const medRefs = dispenseItems.map(item => doc(db, 'medications', item.medId))
        const medSnaps = await Promise.all(medRefs.map(ref => transaction.get(ref)))

        // Validate stock
        medSnaps.forEach((snap, idx) => {
          if (!snap.exists()) throw new Error(`ไม่พบข้อมูลยา ${dispenseItems[idx].med.name}`)
          const currentStock = snap.data().stock
          const deductQty = dispenseItems[idx].quantity
          if (currentStock < deductQty) {
            throw new Error(`ยา "${dispenseItems[idx].med.name}" สต็อกไม่เพียงพอ (เหลือ ${currentStock})`)
          }
        })

        // Write Phase - Deduct Stock
        medSnaps.forEach((snap, idx) => {
          const newStock = snap.data().stock - dispenseItems[idx].quantity
          transaction.update(snap.ref, { 
            stock: newStock,
            updatedAt: serverTimestamp()
          })
        })

          // Record Prescription / Pharmacy Log
          const logRef = doc(collection(db, 'pharmacy_logs'))
          transaction.set(logRef, {
            queueId: selectedQueue.id,
            patientName: selectedQueue.patientName,
            dispensedBy: currentUser.uid,
            items: dispenseItems.map(i => ({
              medId: i.medId,
              name: i.med.name,
              quantity: i.quantity,
              price: i.price,
              subtotal: i.subtotal,
              unit: i.med.unit
            })),
            totalPrice: dispenseTotal,
            createdAt: serverTimestamp()
          })

          // Mark queue as dispensed
          const qRef = doc(db, 'queues', selectedQueue.id)
          transaction.update(qRef, { isDispensed: true })
        })

        setSuccessMsg(`จ่ายยาสำเร็จ! หักสต็อกเรียบร้อย ยอดรวม ${dispenseTotal} บาท`)
      setDispenseItems([])
      setSelectedQueue(null)
      // Switch to POS / Billing mentally, or just stay here
      
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message)
    } finally {
      setIsDispensing(false)
    }
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
    <StaffHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      
      {/* Toast Notifications */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          ✅ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">💊 จัดการคลังยาและการจ่ายยา (Pharmacy)</h1>
            <p className="text-gray-500 mt-1">ตรวจสอบสต็อก รับสินค้าเข้า และจ่ายยาให้คนไข้พร้อมหักอัตโนมัติ</p>
          </div>
        </div>

        {/* Low Stock Alert Highlights */}
        {lowStockMeds.length > 0 && (
          <div className="mb-8 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-4 animate-pulse-slow">
            <div className="bg-red-100 p-2 rounded-lg mt-1">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-red-800 text-lg">แจ้งเตือนสินค้าใกล้หมด (Reorder Point Alert)</h3>
              <p className="text-sm text-red-700 mt-1">มียา {lowStockMeds.length} รายการ ที่สต็อกลดลงถึงจุดที่ต้องสั่งซื้อเพิ่ม (Stock &le; Reorder Point)</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {lowStockMeds.map(med => (
                  <span key={med.id} className="inline-flex items-center px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-lg border border-red-200 cursor-pointer hover:bg-red-200" onClick={() => { setActiveTab('inventory'); openInvModal(med); }}>
                    {med.name} (เหลือ {med.stock})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex bg-gray-50 p-1 rounded-xl w-max mb-6 border border-gray-100">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'inventory' ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📦 คลังยา (Inventory)
          </button>
          <button
            onClick={() => setActiveTab('dispense')}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'dispense' ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📋 จัดยา/จ่ายยา (Dispense)
          </button>
        </div>

        {/* ════════════════════════════════════════════
            TAB: INVENTORY
            ════════════════════════════════════════════ */}
        {activeTab === 'inventory' && (
          <div className="animate-[fadeIn_0.2s_ease]">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
              <input
                type="text"
                placeholder="ค้นหาชื่อยา หรือ หมวดหมู่..."
                className="w-full sm:w-80 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button
                onClick={() => openInvModal()}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition"
              >
                + รับสินค้าเข้าคลัง / เพิ่มยาใหม่
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-700 text-left border-b border-gray-200">
                    <th className="px-4 py-3 font-bold w-1/4">ชื่อยา/สินค้า</th>
                    <th className="px-4 py-3 font-bold">หมวดหมู่</th>
                    <th className="px-4 py-3 font-bold text-center">คงเหลือ</th>
                    <th className="px-4 py-3 font-bold text-center">หน่วย</th>
                    <th className="px-4 py-3 font-bold text-right">ราคา/หน่วย</th>
                    <th className="px-4 py-3 font-bold text-center">จุดสั่งซื้อ</th>
                    <th className="px-4 py-3 font-bold text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMeds.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-400">
                        {searchQuery ? 'ไม่พบข้อมูลยาที่ค้นหา' : 'ยังไม่มีข้อมูลยาในคลัง'}
                      </td>
                    </tr>
                  ) : (
                    filteredMeds.map(med => {
                      const isLowStock = med.stock <= (med.reorderPoint || 0)
                      return (
                        <tr key={med.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {med.name}
                            {isLowStock && <span className="ml-2 inline-block w-2 h-2 bg-red-500 rounded-full animate-ping"></span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{med.category}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                              isLowStock ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'
                            }`}>
                              {med.stock}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-center">{med.unit}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-700">{formatCurrency(med.price)}</td>
                          <td className="px-4 py-3 text-center text-gray-500">{med.reorderPoint}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => openInvModal(med)}
                              className="text-emerald-600 hover:text-emerald-800 font-semibold px-3 py-1 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition whitespace-nowrap"
                            >
                              แก้ไข / เติมสต็อก
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════
            TAB: DISPENSE
            ════════════════════════════════════════════ */}
        {activeTab === 'dispense' && (
          <div className="animate-[fadeIn_0.2s_ease]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Select Queues and Search Drugs */}
              <div className="space-y-6">
                
                {/* 1. Select Queue */}
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200">
                  <h3 className="font-bold text-gray-800 mb-3 text-lg">1. เลือกคนไข้ (คิววันนี้)</h3>
                  <div className="relative">
                    <select
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none bg-white font-medium"
                      value={selectedQueue?.id || ''}
                      onChange={(e) => {
                        const q = queues.find(x => x.id === e.target.value)
                        setSelectedQueue(q || null)

                        // Auto-populate from Doctor's prescription
                        if (q && q.medications && Array.isArray(q.medications)) {
                          const autoItems = q.medications.map(item => {
                            // Find the latest medication data to get current price and stock
                            const latestMed = medications.find(m => m.id === item.med.id) || item.med
                            const price = latestMed.price || 0
                            const qty = Number(item.qty)
                            return {
                              medId: latestMed.id,
                              med: latestMed,
                              quantity: qty,
                              price: price,
                              subtotal: qty * price
                            }
                          })
                          setDispenseItems(autoItems)
                        } else {
                          setDispenseItems([])
                        }
                      }}
                    >
                      <option value="">-- เลือกคนไข้ที่รอจัดยา --</option>
                      {queues.map(q => (
                        <option key={q.id} value={q.id}>
                          คิวที่ {q.queueNumber} - {q.patientName} [{q.status === 'completed' ? 'ตรวจเสร็จแล้ว' : 'รอ/กำลังตรวจ'}]
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Prescription Cart & Confirm */}
              <div>
                <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-200 p-6 sticky top-8">
                  <h3 className="font-bold text-gray-800 text-xl mb-4 border-b pb-3">📦 ตะกร้าจัดยา</h3>
                  
                  {/* Patient Info */}
                  {selectedQueue ? (
                    <div className="mb-4 bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                      <div className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-1">คนไข้รับยา</div>
                      <div className="font-bold text-gray-900 text-lg">คิว #{selectedQueue.queueNumber} - {selectedQueue.patientName}</div>
                    </div>
                  ) : (
                    <div className="mb-4 text-amber-600 text-sm bg-amber-50 p-3 rounded-xl border border-amber-100">
                      กรุณาเลือกคนไข้จากคิวด้านซ้าย
                    </div>
                  )}

                  {/* Cart Items */}
                  <div className="space-y-3 min-h-[200px]">
                    {dispenseItems.length === 0 ? (
                      <div className="text-center py-12 text-gray-400 flex flex-col items-center">
                        <span className="text-4xl mb-2">🛒</span>
                        <p className="text-sm">ยังไม่มีรายการยาในตะกร้า</p>
                      </div>
                    ) : (
                      dispenseItems.map(item => (
                        <div key={item.medId} className="flex gap-3 bg-gray-50 border border-gray-200 p-3 rounded-xl">
                          <div className="flex-1">
                            <div className="font-bold text-gray-900">{item.med.name}</div>
                            <div className="text-xs text-gray-500">{formatCurrency(item.price)} ต่อ {item.med.unit}</div>
                          </div>
                          
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-1 bg-gray-100 border border-gray-300 rounded-lg px-3 py-1">
                              <span className="font-bold text-sm text-gray-700">จำนวน: {item.quantity}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-emerald-700">{formatCurrency(item.subtotal)}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Summary & Confirm */}
                  <div className="mt-6 border-t pt-4">
                    <div className="flex justify-between items-end mb-4">
                      <span className="text-gray-600 font-bold">รวมทั้งสิ้น:</span>
                      <span className="text-3xl font-bold text-emerald-700">{formatCurrency(dispenseTotal)}</span>
                    </div>
                    <button
                      onClick={handleDispense}
                      disabled={!selectedQueue || dispenseItems.length === 0 || isDispensing}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-700 hover:to-green-600 active:scale-[0.98] text-white rounded-xl font-bold text-lg shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDispensing ? 'กำลังดำเนินการ...' : '✓ ดำเนินการจ่ายยาและหักสต็อก'}
                    </button>
                    <p className="text-xs text-center text-gray-500 mt-2">เมื่อกดยืนยัน สต็อกของยาจะถูกหักออกอัตโนมัติตามจำนวนข้างต้น</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ════════════════════════════════════════════
          MODAL: INVENTORY (Add/Edit)
          ════════════════════════════════════════════ */}
      {isInvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50 text-gray-900">
              <h3 className="font-bold text-lg">{invFormData.id ? 'แก้ไข/รับสินค้าเพิ่ม' : 'เพิ่มยารายการใหม่'}</h3>
              <button onClick={closeInvModal} className="text-gray-400 hover:text-gray-600 p-1 bg-white rounded-lg border hover:bg-gray-50">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={saveInventory} className="overflow-y-auto p-6 space-y-5 custom-scrollbar">
              <div>
                <label className="block text-sm text-gray-700 font-semibold mb-1">ชื่อยา / สินค้า <span className="text-red-500">*</span></label>
                <input required type="text" className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" value={invFormData.name} onChange={e => setInvFormData({...invFormData, name: e.target.value})} />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 font-semibold mb-1">หมวดหมู่</label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" value={invFormData.category} onChange={e => setInvFormData({...invFormData, category: e.target.value})}>
                    <option>ยาเม็ด</option>
                    <option>ยาน้ำ</option>
                    <option>แคปซูล</option>
                    <option>ยาทาภายนอก</option>
                    <option>เวชภัณฑ์</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 font-semibold mb-1">หน่วยนับ</label>
                  <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="เช่น เม็ด, ขวด" value={invFormData.unit} onChange={e => setInvFormData({...invFormData, unit: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                  <label className="block text-sm text-emerald-800 font-bold mb-1">คงเหลือ (จำนวน)</label>
                  <input type="number" required className="w-full px-4 py-2 border border-emerald-300 rounded-lg outline-none font-bold text-center" value={invFormData.stock} onChange={e => setInvFormData({...invFormData, stock: e.target.value})} />
                </div>
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <label className="block text-sm text-blue-800 font-bold mb-1">ราคาต่อหน่วย (บาท)</label>
                  <input type="number" required step="0.01" className="w-full px-4 py-2 border border-blue-300 rounded-lg outline-none font-bold text-center" value={invFormData.price} onChange={e => setInvFormData({...invFormData, price: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-sm text-amber-800 font-bold mb-1">จุดแจ้งเตือนสั่งซื้อ (Reorder Point)</label>
                <input type="number" required className="w-full px-4 py-2 border border-amber-300 bg-amber-50 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none" value={invFormData.reorderPoint} onChange={e => setInvFormData({...invFormData, reorderPoint: e.target.value})} />
                <p className="text-xs text-gray-500 mt-1">ระบบจะแจ้งเตือนเมื่อสต็อกน้อยกว่าหรือเท่ากับตัวเลขนี้</p>
              </div>

              <div>
                <label className="block text-sm text-gray-700 font-semibold mb-1">รายละเอียดเพิ่มเติม</label>
                <textarea rows="2" className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" value={invFormData.description} onChange={e => setInvFormData({...invFormData, description: e.target.value})}></textarea>
              </div>
            </form>

            <div className="p-5 border-t bg-gray-50 flex gap-3 justify-end items-center">
              <button type="button" onClick={closeInvModal} className="px-5 py-2.5 text-gray-600 bg-white border border-gray-300 rounded-xl font-bold hover:bg-gray-100 transition shadow-sm">
                ยกเลิก
              </button>
              <button type="submit" onClick={saveInventory} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition shadow-sm shadow-emerald-200">
                บันทึกข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

    </StaffHeader>
  )
}

export default StaffPharmacyManagement
