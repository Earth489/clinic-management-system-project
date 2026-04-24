import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import DoctorHeader from '../components/DoctorHeader'

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount || 0)
}

function DoctorPrescription() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()
  
  const printRef = useRef(null)

  const [patients, setPatients] = useState([])
  const [medications, setMedications] = useState([])
  
  // Form State
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [searchMed, setSearchMed] = useState('')
  const [rxItems, setRxItems] = useState([]) // { med: {}, qty: 1, instruction: '' }
  const [notes, setNotes] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // ── Fetch Data ──
  useEffect(() => {
    // Fetch Patients
    const unsubPat = onSnapshot(query(collection(db, 'patients'), orderBy('firstname')), (snap) => {
      setPatients(snap.docs.map(d => ({id: d.id, ...d.data()})))
    })
    
    // Fetch Medications
    const unsubMed = onSnapshot(query(collection(db, 'medications'), orderBy('name')), (snap) => {
      setMedications(snap.docs.map(d => ({id: d.id, ...d.data()})))
    })

    return () => { unsubPat(); unsubMed() }
  }, [])

  const selectedPatient = useMemo(() => patients.find(p => p.id === selectedPatientId), [patients, selectedPatientId])

  const filteredMeds = useMemo(() => {
    if (!searchMed) return medications
    const term = searchMed.toLowerCase()
    return medications.filter(m => m.name.toLowerCase().includes(term) || m.category.toLowerCase().includes(term))
  }, [medications, searchMed])

  const handleAddMed = (med) => {
    if (rxItems.find(i => i.med.id === med.id)) {
      alert('ยานี้อยู่ในรายการแล้ว')
      return
    }
    setRxItems([...rxItems, { med, qty: 1, instruction: '' }])
  }

  const handleUpdateItem = (medId, field, value) => {
    setRxItems(rxItems.map(i => i.med.id === medId ? { ...i, [field]: value } : i))
  }

  const handleRemoveItem = (medId) => {
    setRxItems(rxItems.filter(i => i.med.id !== medId))
  }

  const handleSavePrescription = async () => {
    if (!selectedPatient) return alert('กรุณาเลือกคนไข้')
    if (rxItems.length === 0) return alert('กรุณาเพิ่มยาอย่างน้อย 1 รายการ')
    
    try {
      await addDoc(collection(db, 'prescription_records'), {
        patientId: selectedPatient.id,
        patientName: `${selectedPatient.firstname} ${selectedPatient.lastname}`,
        doctorId: currentUser.uid,
        items: rxItems.map(i => ({
           medId: i.med.id,
           name: i.med.name,
           qty: Number(i.qty),
           unit: i.med.unit,
           instruction: i.instruction
        })),
        notes,
        createdAt: serverTimestamp()
      })
      setSuccessMsg('บันทึกใบสั่งยาเข้าระบบสำเร็จ')
      
      // Auto print
      setTimeout(() => {
        window.print()
      }, 500)
      
      // Reset
      setRxItems([])
      setNotes('')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch(err) {
      alert('Error: ' + err.message)
    }
  }

  const handleLogout = async () => {
    try { await logout(); navigate('/') } catch(err) {}
  }

  return (
    <DoctorHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
       
       {successMsg && (
         <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease] print:hidden">
           {successMsg}
         </div>
       )}

       {/* Hide this entire wrapper when printing, except the printable pad */}
       <div className="flex flex-col lg:flex-row gap-6 print:hidden">
         
         {/* Left: Tools & Selectors */}
         <div className="w-full lg:w-1/2 space-y-6">
           
           <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
             <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">📝 ออกใบสั่งยาดิจิทัล (Rx Pad)</h2>
             <div className="space-y-4">
               <div>
                 <label className="block text-sm font-semibold text-gray-700 mb-1">1. เลือกคนไข้</label>
                 <select 
                   className="w-full px-4 py-2 border border-blue-200 rounded-xl bg-blue-50 focus:ring-2 focus:ring-blue-500 font-medium outline-none"
                   value={selectedPatientId} onChange={e => setSelectedPatientId(e.target.value)}
                 >
                   <option value="">-- ค้นหา / เลือกชื่อคนไข้ --</option>
                   {patients.map(p => (
                     <option key={p.id} value={p.id}>HN: {p.hnnumber} | {p.firstname} {p.lastname}</option>
                   ))}
                 </select>
               </div>
             </div>
           </div>

           <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col h-[50vh]">
             <h2 className="text-lg font-bold text-gray-800 mb-4">2. ค้นหาและเลือกยาจากคลัง</h2>
             <input type="text" placeholder="พิมพ์ชื่อยา..." className="w-full px-4 py-2 border border-gray-200 rounded-xl mb-4" value={searchMed} onChange={e => setSearchMed(e.target.value)} />
             
             <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {filteredMeds.map(med => (
                  <div key={med.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:border-blue-300 transition-all bg-gray-50">
                    <div>
                      <div className="font-bold text-gray-800">{med.name} <span className="text-xs text-gray-500 font-normal ml-2">({med.category})</span></div>
                      <div className="text-xs text-emerald-600 mt-0.5">คลังยา: {med.stock} {med.unit}</div>
                    </div>
                    <button onClick={() => handleAddMed(med)} className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-lg text-blue-600 hover:bg-blue-50 font-bold text-lg leading-none">+</button>
                  </div>
                ))}
             </div>
           </div>

         </div>


         {/* Right: The Rx Pad (Printable Area) */}
         <div className="w-full lg:w-1/2">
           <div 
             className="bg-white p-8 rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-200 min-h-[70vh] flex flex-col print:shadow-none print:border-none print:p-0"
             ref={printRef}
           >
              {/* Rx Header */}
              <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6">
                 <div>
                   <h1 className="text-3xl font-black text-blue-900 tracking-tight">CLINIC<span className="text-emerald-500">CARE</span></h1>
                   <p className="text-sm text-gray-500 mt-1">ใบสั่งยาแพทย์ (Medical Prescription)</p>
                 </div>
                 <div className="text-right">
                   <div className="text-4xl font-serif text-gray-300 font-black italic mr-2">Rx</div>
                   <div className="text-sm font-semibold text-gray-600 mt-2">วันที่: {new Date().toLocaleDateString('th-TH')}</div>
                 </div>
              </div>

              {/* Patient Banner */}
              {selectedPatient ? (
                <div className="flex flex-wrap gap-x-8 gap-y-2 mb-8 bg-blue-50 p-4 rounded-xl border border-blue-100 print:bg-transparent print:border-none print:p-0 print:mb-4">
                  <div className="w-full md:w-auto"><span className="text-gray-500 text-sm font-bold mr-2">ชื่อคนไข้ (Patient Name):</span> <span className="font-bold text-blue-900">{selectedPatient.firstname} {selectedPatient.lastname}</span></div>
                  <div><span className="text-gray-500 text-sm font-bold mr-2">HN:</span> <span className="font-mono font-bold text-gray-800">{selectedPatient.hnnumber}</span></div>
                  <div><span className="text-gray-500 text-sm font-bold mr-2">อายุ:</span> <span className="font-bold text-gray-800">{selectedPatient.birthdate ? `${new Date().getFullYear() - new Date(selectedPatient.birthdate).getFullYear()} ปี` : '-'}</span></div>
                  <div className="w-full mt-2"><span className="text-gray-500 text-sm font-bold mr-2">ประวัติแพ้ยา (Allergies):</span> <span className="font-bold text-red-600">{selectedPatient.allergyhistory?.length > 0 ? selectedPatient.allergyhistory.join(', ') : 'ปฏิเสธการแพ้ยา'}</span></div>
                </div>
              ) : (
                <div className="mb-8 p-4 border border-dashed border-gray-300 rounded-xl text-center text-gray-400 font-medium print:hidden">กรุณาเลือกคนไข้จากด้านซ้าย</div>
              )}

              {/* Prescribed Items */}
              <div className="flex-1">
                 {rxItems.length === 0 ? (
                   <p className="text-center text-gray-300 italic py-10 print:hidden">ยังไม่มีรายการยาในใบสั่งยาฉบับนี้</p>
                 ) : (
                   <div className="space-y-4">
                      {rxItems.map((item, idx) => (
                        <div key={item.med.id} className="relative flex items-start gap-4 p-4 border border-gray-200 rounded-xl bg-white print:border-b print:rounded-none print:px-0">
                           <div className="font-bold text-gray-400 mt-1">{idx+1}.</div>
                           <div className="flex-1">
                             <div className="flex justify-between items-center">
                               <div className="font-bold text-lg text-gray-900">{item.med.name}</div>
                               <div className="flex items-center gap-2 print:hidden">
                                 <input type="number" className="w-16 px-2 py-1 border border-gray-300 rounded text-center font-bold" min="1" value={item.qty} onChange={(e) => handleUpdateItem(item.med.id, 'qty', e.target.value)} />
                                 <span className="text-sm font-medium text-gray-500">{item.med.unit}</span>
                                 <button onClick={() => handleRemoveItem(item.med.id)} className="ml-3 text-red-400 hover:text-red-600">✕</button>
                               </div>
                               <div className="hidden print:block font-bold text-gray-800">
                                 # Dispense: {item.qty} {item.med.unit}
                               </div>
                             </div>
                             
                             <div className="mt-2">
                               <input 
                                 type="text" 
                                 placeholder="วิธีรับประทานยา (เช่น ครั้งละ 1 เม็ด หลังอาหาร 3 เวลา)" 
                                 className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-blue-800 font-semibold focus:ring-0 outline-none print:hidden"
                                 value={item.instruction}
                                 onChange={e => handleUpdateItem(item.med.id, 'instruction', e.target.value)}
                               />
                               <div className="hidden print:block mt-1 text-sm italic font-medium">Sig: {item.instruction || '_________________________________________'}</div>
                             </div>
                           </div>
                        </div>
                      ))}
                   </div>
                 )}
              </div>

              {/* Notes */}
              <div className="mt-8 print:hidden">
                <label className="block text-sm font-bold text-gray-600 mb-2">บันทึกเพิ่มเติมจากแพทย์ (Notes)</label>
                <textarea rows="2" className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-blue-500" value={notes} onChange={e => setNotes(e.target.value)}></textarea>
              </div>
              <div className="hidden print:block mt-8 text-sm">
                <strong>Notes:</strong> {notes || '-'}
              </div>

              {/* Doctor Signature */}
              <div className="mt-16 pt-8 flex justify-end">
                 <div className="text-center w-64">
                   <div className="border-b border-gray-400 mb-2 h-8"></div>
                   <div className="font-bold text-gray-800">แพทย์ผู้สั่งยา (Physician)</div>
                   <div className="text-xs text-gray-500 mt-1">ใบสั่งยานี้มีอายุ 7 วันนับจากวันที่ระบุข้างต้น</div>
                 </div>
              </div>

              {/* Action */}
              <div className="mt-10 border-t pt-6 print:hidden">
                <button 
                  onClick={handleSavePrescription}
                  className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold text-lg hover:bg-black transition-colors shadow-lg"
                >
                  🖨️ บันทึก และ สั่งพิมพ์ใบสั่งยา (Save & Print Rx)
                </button>
              </div>

           </div>
         </div>

       </div>
    </DoctorHeader>
  )
}

export default DoctorPrescription
