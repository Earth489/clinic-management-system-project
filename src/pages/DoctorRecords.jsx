import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import { collection, query, orderBy, onSnapshot, where, getDocs } from 'firebase/firestore'
import DoctorHeader from '../components/DoctorHeader'

// ──────────────────────────────────────────────
// Icons
// ──────────────────────────────────────────────
const IconSearch = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
)

const IconFolder = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
  </svg>
)

function DoctorRecords() {
  const { currentUser, userRole, logout } = useAuth()
  const navigate = useNavigate()

  const [patients, setPatients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  
  // History data states
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [treatmentHistory, setTreatmentHistory] = useState([])
  const [emrFiles, setEmrFiles] = useState([])
  const [doctors, setDoctors] = useState({})
  const [invoices, setInvoices] = useState({})

  // ── 0. Fetch Doctors & Invoices ──
  useEffect(() => {
    const qDoctors = query(collection(db, 'users'), where('role', '==', 'doctor'))
    getDocs(qDoctors).then(snap => {
      const docMap = {}
      snap.docs.forEach(d => {
        const data = d.data()
        docMap[d.id] = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email
      })
      setDoctors(docMap)
    })

    const unsubInvoices = onSnapshot(collection(db, 'invoices'), snap => {
      const invMap = {}
      snap.docs.forEach(d => {
        const data = d.data()
        if (data.queueId) invMap[data.queueId] = data.netTotal
      })
      setInvoices(invMap)
    })
    return () => unsubInvoices()
  }, [])

  // ── 1. Fetch Patients List & Filter by Doctor's Patients ──
  useEffect(() => {
    if (!currentUser?.uid) return

    const qPatients = query(collection(db, 'patients'), orderBy('firstname'))
    const qQueues = query(collection(db, 'queues'), where('doctorId', '==', currentUser.uid))

    let allPatients = []
    let treatedIds = new Set()

    const updateList = () => {
      const myPatients = allPatients.filter(p => treatedIds.has(p.id))
      setPatients(myPatients)
    }

    const unsubPatients = onSnapshot(qPatients, (snap) => {
      allPatients = snap.docs.map(d => ({id: d.id, ...d.data()}))
      updateList()
    })

    const unsubQueues = onSnapshot(qQueues, (snap) => {
      const ids = new Set()
      snap.docs.forEach(d => {
        const data = d.data()
        if (data.status === 'completed' || data.status === 'billed') {
          ids.add(data.patientId)
        }
      })
      treatedIds = ids
      updateList()
    })

    return () => { unsubPatients(); unsubQueues() }
  }, [currentUser])

  // ── 2. Fetch Selected Patient History ──
  useEffect(() => {
    if (!selectedPatient) return
    setIsLoadingHistory(true)
    
    // Fetch Queues (Treatments) for this patient
    const qQueues = query(collection(db, 'queues'), where('patientId', '==', selectedPatient.id))
    
    // Fetch Files for this patient
    const qFiles = query(collection(db, `patients/${selectedPatient.id}/files`), orderBy('uploadedAt', 'desc'))

    const unsubQ = onSnapshot(qQueues, (snap) => {
      const qList = snap.docs.map(d => ({id: d.id, ...d.data()}))
        // Only show completed consultations
        .filter(q => q.status === 'completed' || q.status === 'billed')
        .sort((a,b) => {
           // Sort by queue date descending
           const timeA = a.queueDate?.seconds || 0
           const timeB = b.queueDate?.seconds || 0
           return timeB - timeA
        })
      setTreatmentHistory(qList)
    })

    const unsubF = onSnapshot(qFiles, (snap) => {
      setEmrFiles(snap.docs.map(d => ({id: d.id, ...d.data()})))
      setIsLoadingHistory(false)
    })

    return () => { unsubQ(); unsubF() }
  }, [selectedPatient])

  const handleLogout = async () => {
    try { await logout(); navigate('/') } catch(err) {}
  }

  const filteredPatients = patients.filter((p) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      (p.hnnumber || '').toLowerCase().includes(term) ||
      (p.firstname || '').toLowerCase().includes(term) ||
      (p.lastname || '').toLowerCase().includes(term) ||
      (p.phonenumber || '').toLowerCase().includes(term)
    )
  })

  return (
    <DoctorHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6">
        
        {/* Left Column: Patient Directory */}
        <div className="w-full md:w-1/3 flex flex-col h-[85vh]">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
               <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                 <IconFolder /> ค้นหาประวัติผู้ป่วย
               </h2>
               <div className="mt-4 relative">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <IconSearch />
                 </div>
                 <input
                   type="text"
                   className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                   placeholder="พิมพ์ชื่อ, HN หรือเบอร์โทร..."
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                 />
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-2">
               {filteredPatients.length === 0 ? (
                 <div className="text-center text-gray-400 py-10 text-sm">ไม่พบคนไข้ในระบบ...</div>
               ) : (
                 filteredPatients.map(p => (
                   <div 
                     key={p.id}
                     onClick={() => setSelectedPatient(p)}
                     className={`p-4 rounded-xl cursor-pointer border transition-all ${
                       selectedPatient?.id === p.id 
                       ? 'bg-blue-50 border-blue-400 shadow-sm' 
                       : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                     }`}
                   >
                     <div className="flex justify-between items-start mb-1">
                       <span className="font-bold text-blue-800">{p.hnnumber}</span>
                       <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                         {p.birthdate ? `${new Date().getFullYear() - new Date(p.birthdate).getFullYear()} ปี` : '-'}
                       </span>
                     </div>
                     <div className="font-semibold text-gray-900">{p.firstname} {p.lastname}</div>
                     <div className="text-xs text-gray-500 mt-1">{p.phonenumber}</div>
                   </div>
                 ))
               )}
            </div>
          </div>
        </div>

        {/* Right Column: Record Details */}
        <div className="w-full md:w-2/3 flex flex-col h-[85vh]">
          {!selectedPatient ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col items-center justify-center text-gray-400 p-10">
              <span className="text-6xl mb-4">📋</span>
              <h3 className="text-xl font-bold text-gray-600">ประวัติการรักษา (Medical Records)</h3>
              <p className="mt-2 text-sm text-center">กรุณาเลือกคนไข้จากรายชื่อด้านซ้ายเพื่อดูประวัติการเข้ารับบริการ <br/>ผลการตรวจ หรือเอกสารทางการแพทย์ทั้งหมด</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden animate-[fadeIn_0.2s_ease]">
              
              {/* Header Info */}
              <div className="p-6 bg-gradient-to-r from-blue-700 to-blue-900 text-white flex-shrink-0">
                 <div className="flex justify-between items-start">
                   <div>
                     <div className="flex items-center gap-3">
                       <h2 className="text-2xl font-bold">{selectedPatient.firstname} {selectedPatient.lastname}</h2>
                       <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-bold tracking-widest">{selectedPatient.hnnumber}</span>
                     </div>
                     <div className="mt-4 flex gap-6 text-sm text-blue-100">
                       <div><strong>เบอร์ติดต่อ:</strong> {selectedPatient.phonenumber}</div>
                       <div><strong>เพศ:</strong> {selectedPatient.gender?.toUpperCase() || '-'}</div>
                       <div>
                         <strong>ประวัติแพ้ยา:</strong>{' '}
                         {Array.isArray(selectedPatient.allergyhistory) && selectedPatient.allergyhistory.length > 0 ? (
                           <span className="bg-red-500/80 px-2 py-0.5 rounded font-bold text-white border border-red-400">
                             {selectedPatient.allergyhistory.join(', ')}
                           </span>
                         ) : 'ไม่มี'}
                       </div>
                     </div>
                   </div>
                 </div>
              </div>

              {/* History Tabs Content */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50 custom-scrollbar">
                
                {isLoadingHistory ? (
                  <div className="text-center py-20 text-gray-400 font-bold">กำลังโหลดประวัติ...</div>
                ) : (
                  <>
                    {/* EMR Files Gallery */}
                    <div className="mb-8">
                       <h3 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 flex items-center gap-2">
                         📁 เอกสารแนบ / ผลแล็บ (EMR Files)
                       </h3>
                       {emrFiles.length === 0 ? (
                         <div className="text-sm text-gray-400">ไม่มีไฟล์ถูกอัปโหลดสำหรับคนไข้รายนี้</div>
                       ) : (
                         <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                           {emrFiles.map(f => (
                             <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="flex flex-col bg-white border border-gray-200 p-3 rounded-xl hover:border-blue-400 hover:shadow-md transition">
                                <div className="h-24 bg-gray-50 rounded-lg mb-2 flex items-center justify-center bg-cover bg-center overflow-hidden border border-gray-100"
                                     style={f.name.match(/\.(jpeg|jpg|gif|png)$/i) ? {backgroundImage: `url(${f.url})`} : {}}>
                                   {!f.name.match(/\.(jpeg|jpg|gif|png)$/i) && <span className="text-3xl">📄</span>}
                                </div>
                                <div className="text-xs font-bold text-blue-700 truncate mb-1">{f.type}</div>
                                <div className="text-xs text-gray-600 truncate">{f.name}</div>
                             </a>
                           ))}
                         </div>
                       )}
                    </div>

                    {/* Timeline */}
                    <div>
                       <h3 className="text-lg font-bold text-gray-800 mb-6 pb-2 border-b border-gray-200 flex items-center gap-2">
                         🏥 ประวัติการเข้ารับบริการ (Visits)
                       </h3>
                       {treatmentHistory.length === 0 ? (
                         <div className="text-sm text-gray-400">ยังไม่มีประวัติการตรวจในระบบ</div>
                       ) : (
                         <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-300 before:to-transparent">
                           {treatmentHistory.map((visit, idx) => {
                             const vDate = visit.queueDate?.seconds 
                               ? new Date(visit.queueDate.seconds * 1000).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit'}) 
                               : '-'
                             
                             const cost = visit.netTotal !== undefined ? visit.netTotal : invoices[visit.id]

                             return (
                               <div key={visit.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                 <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-100 text-blue-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                                   🩺
                                 </div>
                                 <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                                   <div className="flex items-center justify-between mb-1">
                                     <div className="font-bold text-blue-800">{vDate}</div>
                                     <div className="flex items-center gap-2">
                                       {cost !== undefined && (
                                          <span className="text-xs font-bold px-2 py-1 bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                                            ค่าใช้จ่าย: ฿{cost.toLocaleString('th-TH')}
                                          </span>
                                       )}
                                       <div className="text-xs font-semibold px-2 py-1 bg-green-100 text-green-700 rounded-full">เสร็จสิ้น</div>
                                     </div>
                                   </div>
                                   
                                   <div className="text-sm text-gray-600 mb-2">
                                     <span className="font-semibold text-gray-800">แพทย์:</span> {doctors[visit.doctorId] || 'ไม่ระบุแพทย์'} <span className="mx-2">|</span> 
                                     <span className="font-semibold text-gray-800">บริการ:</span> {visit.serviceType || '-'}
                                   </div>

                                   <div className="text-sm font-semibold text-gray-800 mt-2 border-t pt-2 border-gray-50 flex flex-wrap gap-2">
                                     {visit.procedures?.length > 0 ? (
                                        visit.procedures.map((p,i) => <span key={i} className="bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-200">{p.name}</span>)
                                     ) : (
                                        <span className="text-gray-400">ไม่มีบันทึกหัตถการ</span>
                                     )}
                                   </div>

                                   {visit.medications?.length > 0 && (
                                     <div className="mt-2 border-t pt-2 border-gray-50">
                                       <div className="text-xs font-bold text-gray-500 mb-1">ยาที่สั่ง (Medications):</div>
                                       <ul className="text-sm text-gray-700 list-disc list-inside space-y-1">
                                         {visit.medications.map((m, i) => (
                                           <li key={i}>{m.med.name} <span className="text-gray-500 text-xs ml-1">x{m.qty} {m.med?.unit || ''} {m.instruction ? `(${m.instruction})` : ''}</span></li>
                                         ))}
                                       </ul>
                                     </div>
                                   )}

                                   {visit.notes && (
                                     <div className="mt-3 text-sm text-gray-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                                       <span className="font-bold text-amber-800 mr-2">Note:</span>{visit.notes}
                                     </div>
                                   )}
                                 </div>
                               </div>
                             )
                           })}
                         </div>
                       )}
                    </div>
                  </>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    </DoctorHeader>
  )
}

export default DoctorRecords
