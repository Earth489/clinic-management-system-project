import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import DoctorHeader from '../components/DoctorHeader'

function DashboardDocter() {
    const { logout, currentUser, userRole } = useAuth()
    const navigate = useNavigate()

    const handleLogout = async () => {
        try {
            await logout()
            navigate('/')
        } catch (err) {
            console.error('Logout failed:', err)
        }
    }

    return (
        <DoctorHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-900">ยินดีต้อนรับสู่ระบบแพทย์</h2>
                        <p className="text-gray-500 mt-2">จัดการงานทางการแพทย์และดูข้อมูลคนไข้</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-colors" onClick={() => navigate('/doctor/patients')}>
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">👥</span>
                                <h3 className="text-emerald-800 font-bold">ข้อมูลคนไข้</h3>
                            </div>
                            <p className="text-emerald-600 text-sm">ดูข้อมูลคนไข้ในระบบ</p>
                        </div>
                        <div className="p-6 bg-blue-50 rounded-xl border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">📅</span>
                                <h3 className="text-blue-800 font-bold">นัดหมาย</h3>
                            </div>
                            <p className="text-blue-600 text-sm">จัดการนัดหมายคนไข้</p>
                        </div>
                        <div className="p-6 bg-purple-50 rounded-xl border border-purple-100 cursor-pointer hover:bg-purple-100 transition-colors">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">📋</span>
                                <h3 className="text-purple-800 font-bold">ประวัติการรักษา</h3>
                            </div>
                            <p className="text-purple-600 text-sm">ดูประวัติการรักษาแบบ EMR</p>
                        </div>
                        <div className="p-6 bg-orange-50 rounded-xl border border-orange-100 cursor-pointer hover:bg-orange-100 transition-colors">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">💊</span>
                                <h3 className="text-orange-800 font-bold">ใบสั่งยา</h3>
                            </div>
                            <p className="text-orange-600 text-sm">จัดการใบสั่งยา</p>
                        </div>
                    </div>
                </div>
            </div>
        </DoctorHeader>
    )
}

export default DashboardDocter
