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

function AdminPharmacyManagement() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [medications, setMedications] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    category: 'ยาเม็ด',
    description: '',
    stock: 0,
    unit: 'เม็ด',
    cost: 0,          // NEW: Only admin manages cost
    price: 0,
    reorderPoint: 20
  })

  // ── Fetch Medications ─────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'medications'), orderBy('name'))
    const unsub = onSnapshot(q, (snap) => {
      setMedications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    }, (error) => {
      setErrorMsg("Error fetching medications: " + error.message)
    })

    return () => unsub()
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

  // ── Computed Arrays ───────────────────────────
  const filteredMeds = useMemo(() => {
    if (!searchQuery) return medications
    const lowerQuery = searchQuery.toLowerCase()
    return medications.filter(m =>
      m.name.toLowerCase().includes(lowerQuery) ||
      m.category.toLowerCase().includes(lowerQuery)
    )
  }, [medications, searchQuery])

  // ── Handlers ──────────────────────────────────
  const openModal = (med = null) => {
    if (med) {
      setFormData({ 
        id: med.id, 
        name: med.name,
        category: med.category || 'ยาเม็ด',
        description: med.description || '',
        stock: med.stock || 0,
        unit: med.unit || 'เม็ด',
        cost: med.cost || 0,
        price: med.price || 0,
        reorderPoint: med.reorderPoint || 20 
      })
    } else {
      setFormData({
        id: null, name: '', category: 'ยาเม็ด', description: '',
        stock: 0, unit: 'เม็ด', cost: 0, price: 0, reorderPoint: 20
      })
    }
    setIsModalOpen(true)
  }

  const closeModal = () => setIsModalOpen(false)

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      const dataToSave = {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        stock: Number(formData.stock),
        unit: formData.unit,
        cost: Number(formData.cost),
        price: Number(formData.price),
        reorderPoint: Number(formData.reorderPoint),
        updatedAt: serverTimestamp()
      }

      if (formData.id) {
        await updateDoc(doc(db, 'medications', formData.id), dataToSave)
        setSuccessMsg('อัปเดตข้อมูลยาสำเร็จ (Master Data Updated)')
      } else {
        dataToSave.createdAt = serverTimestamp()
        await addDoc(collection(db, 'medications'), dataToSave)
        setSuccessMsg('เพิ่มยารายการใหม่เป็น Master Data สำเร็จ')
      }
      closeModal()
    } catch (err) {
      setErrorMsg('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  const handleDeleteTrigger = (med) => {
    setDeleteTarget(med)
    setIsDeleting(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteDoc(doc(db, 'medications', deleteTarget.id))
      setSuccessMsg(`ลบประวัติยา "${deleteTarget.name}" เรียบร้อยแล้ว`)
      setIsDeleting(false)
      setDeleteTarget(null)
    } catch(err) {
      setErrorMsg('ลบไม่สำเร็จ: ' + err.message)
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
    <AdminHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      
      {/* Toast Messages */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-sm font-bold animate-[fadeIn_0.3s_ease] shadow-sm">
          ✓ {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm font-bold animate-[fadeIn_0.3s_ease] shadow-sm">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
        
        {/* Header Config */}
        <div className="bg-gradient-to-r from-slate-50 to-white px-8 py-6 border-b border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">💊 จัดการฐานข้อมูลยา (Master Data)</h1>
              <p className="text-slate-500 mt-1 text-sm font-medium">เพิ่ม, แก้ไข, ลบข้อมูลยา รวมถึงกำหนด ต้นทุน และ ราคาขาย</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="ค้นหาชื่อยา หรือ หมวดหมู่..."
                  className="w-full md:w-64 pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 text-sm font-medium outline-none bg-white shadow-sm"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none opacity-50">
                  🔍
                </div>
              </div>
              <button
                onClick={() => openModal()}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 whitespace-nowrap"
              >
                + เพิ่มรายการยาใหม่
              </button>
            </div>
          </div>
        </div>

        {/* Setup Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100/50 text-slate-600">
                <th className="px-6 py-4 font-bold border-b border-slate-200">ชื่อยา / สินค้า</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200">หมวดหมู่</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200 text-center">คลัง (Stock)</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200 text-right">ต้นทุน/หน่วย</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200 text-right">ราคาขาย/หน่วย</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200 text-center">จุดสั่งซื้อ</th>
                <th className="px-6 py-4 font-bold border-b border-slate-200 text-center w-24">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMeds.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center">
                    <div className="mx-auto w-16 h-16 bg-slate-50 flex items-center justify-center rounded-full mb-3 text-2xl grayscale opacity-60">💊</div>
                    <p className="text-slate-400 font-semibold">{searchQuery ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีฐานข้อมูลยา'}</p>
                  </td>
                </tr>
              ) : (
                filteredMeds.map(med => (
                  <tr key={med.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{med.name}</div>
                      <div className="text-xs text-slate-500 mt-1 max-w-[200px] truncate" title={med.description}>{med.description || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-600">
                        {med.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`font-bold ${med.stock <= (med.reorderPoint||0) ? 'text-red-500' : 'text-slate-700'}`}>
                        {med.stock} <span className="text-xs font-normal text-slate-500">{med.unit}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">{formatCurrency(med.cost)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">{formatCurrency(med.price)}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-slate-500 font-medium">{med.reorderPoint}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openModal(med)}
                          className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors tooltip-trigger"
                          title="แก้ไข"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => handleDeleteTrigger(med)}
                          className="w-8 h-8 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors tooltip-trigger"
                          title="ลบข้อมูล"
                        >
                          ✕
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

      {/* ════════════════════════════════════════════
          MODAL: ADD/EDIT MEDICATION (Admin)
          ════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-xl text-slate-800">
                {formData.id ? 'แก้ไขฐานข้อมูลยา' : 'ลงทะเบียนยาใหม่'}
              </h3>
              <button onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSave} className="overflow-y-auto px-8 py-6 space-y-6 custom-scrollbar bg-white">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-700 font-bold mb-2">ชื่อยา / สินค้า <span className="text-red-500">*</span></label>
                  <input required type="text" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-medium" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="เช่น Paracetamol 500mg" />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-700 font-bold mb-2">หมวดหมู่ <span className="text-red-500">*</span></label>
                  <select className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none bg-white font-medium" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                    <option>ยาเม็ด</option>
                    <option>ยาน้ำ</option>
                    <option>แคปซูล</option>
                    <option>ยาฉีด</option>
                    <option>ยาทาภายนอก</option>
                    <option>เวชภัณฑ์</option>
                    <option>อาหารเสริม</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-700 font-bold mb-2">หน่วยนับ (Unit)</label>
                  <input type="text" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-medium text-slate-600" value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder="เช่น เม็ด, ขวด" />
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <h4 className="font-bold text-slate-800 mb-4 text-sm uppercase tracking-wider">ข้อมูลบัญชีและการเงิน</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-orange-600 font-bold mb-1.5">ต้นทุนยา (Cost)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                      <input type="number" step="0.01" required className="w-full pl-8 pr-3 py-2.5 border border-orange-200 rounded-lg outline-none font-bold text-orange-700 bg-white" value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-teal-600 font-bold mb-1.5">ราคาขาย (Price)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">฿</span>
                      <input type="number" step="0.01" required className="w-full pl-8 pr-3 py-2.5 border border-teal-200 rounded-lg outline-none font-bold text-teal-700 bg-white" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-blue-600 font-bold mb-1.5">สต็อกเริ่มต้น</label>
                    <input type="number" required className="w-full px-4 py-2.5 border border-blue-200 rounded-lg outline-none font-bold text-blue-700 bg-white" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-700 font-bold mb-2">จุดแจ้งเตือนสั่งซื้อ (Reorder Point)</label>
                <input type="number" required className="w-full md:w-1/2 px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-medium" value={formData.reorderPoint} onChange={e => setFormData({...formData, reorderPoint: e.target.value})} />
                <p className="text-xs text-slate-500 mt-1.5">ตัวเลขเตือน Staff ให้เตรียมสั่งซื้อของเมื่อสต็อกเหลือน้อยกว่าหรือเท่ากับจุดนี้</p>
              </div>

              <div>
                <label className="block text-sm text-slate-700 font-bold mb-2">รายละเอียดเพิ่มเติม</label>
                <textarea rows="2" className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none font-medium text-slate-600 resize-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="ข้อมูลการใช้งาน หรือวิธีเก็บรักษา..."></textarea>
              </div>
            </form>

            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-3xl">
              <button type="button" onClick={closeModal} className="px-6 py-2.5 text-slate-600 bg-white border border-slate-300 rounded-xl font-bold hover:bg-slate-100 transition shadow-sm">
                ยกเลิก
              </button>
              <button type="submit" onClick={handleSave} className="px-8 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition shadow-lg shadow-slate-200">
                {formData.id ? 'บันทึกการแก้ไข' : 'บันทึกเข้าระบบ'}
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          MODAL: DELETE CONFIRMATION
          ════════════════════════════════════════════ */}
      {isDeleting && deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease]">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center transform transition-all scale-100">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">ยืนยันการลบข้อมูล</h3>
            <p className="text-slate-500 text-sm mb-6">คุณแน่ใจหรือไม่ที่จะลบ <strong className="text-slate-800">{deleteTarget.name}</strong> ออกจากฐานข้อมูล? การกระทำนี้ไม่สามารถย้อนกลับได้</p>
            
            <div className="flex gap-3 justify-center">
              <button onClick={() => setIsDeleting(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition">
                ยกเลิก
              </button>
              <button onClick={confirmDelete} className="px-5 py-2.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition shadow-lg shadow-red-200">
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}

    </AdminHeader>
  )
}

export default AdminPharmacyManagement
