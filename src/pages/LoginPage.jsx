import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const { login, userRole, currentUser } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (currentUser && userRole !== '') {
      if (userRole === null) {
        setError('ไม่พบข้อมูลสิทธิ์ (role) ในระบบ กรุณาตรวจสอบ Firestore')
        setIsLoggingIn(false)
        return
      }

      const role = userRole.toLowerCase().trim()
      if (role === 'admin') navigate('/dashboard-admin')
      else if (role === 'staff') navigate('/dashboard-staff')
      else if (role === 'doctor') navigate('/dashboard-doctor')
      else {
        setError(`ไม่พบหน้า Dashboard สำหรับ Role: ${userRole}`)
        setIsLoggingIn(false)
      }
    }
  }, [currentUser, userRole, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoggingIn(true)
    try {
      await login(email, password)
      // Redirection is handled by the useEffect above
    } catch (err) {
      console.error('Login failed:', err)
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      setIsLoggingIn(false)
    }
  }

  // Icon Components
  const IconEmail = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  )

  const IconLock = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
    </svg>
  )

  const IconEye = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  )

  const IconEyeOff = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
      <path d="M15.171 13.591l1.473 1.473a1 1 0 001.414-1.414l-14-14a1 1 0 00-1.414 1.414l1.473 1.473A10.014 10.014 0 00.458 10c1.274 4.057 5.064 7 10 7 2.881 0 5.673-.928 7.956-2.5l1.514 1.514a1 1 0 001.414-1.414l-14-14z" />
    </svg>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-emerald-100 to-transparent rounded-full blur-3xl opacity-40 -translate-y-1/2 translate-x-1/2"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-blue-100 to-transparent rounded-full blur-3xl opacity-30 translate-y-1/2 -translate-x-1/4"></div>

      {/* Main Container with Glassmorphism */}
      <div className="w-full max-w-5xl relative z-10">
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden">
          <div className="grid lg:grid-cols-2 gap-0">

            {/* Left Section: Branding & Premium Info */}
            <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 text-white relative overflow-hidden">
              {/* Decorative Pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-white rounded-full blur-3xl"></div>
              </div>

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-12">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30 shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-50">Clinic Management</p>
                    <p className="text-2xl font-bold">ClinicSync</p>
                  </div>
                </div>

                <h1 className="text-4xl font-extrabold mb-4 leading-tight">
                  เข้าสู่ระบบเจ้าหน้าที่<br />
                </h1>
                <p className="text-emerald-50/90 text-lg mb-12 leading-relaxed">
                  ระบบจัดการข้อมูลและสนับสนุนการทำงานภายในคลินิก สำหรับแพทย์และบุคลากร
                </p>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center mt-1 border border-white/30">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white mb-1">ทะเบียนประวัติคนไข้</h4>
                      <p className="text-emerald-50/80 text-sm">ค้นหา ตรวจสอบ และจัดการเวชระเบียน</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center mt-1 border border-white/30">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white mb-1">คิวและตารางนัดหมาย</h4>
                      <p className="text-emerald-50/80 text-sm">จัดการคิวรอตรวจและตารางแพทย์ประจำวัน</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center mt-1 border border-white/30">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-white mb-1">ห้องยาและการเงิน</h4>
                      <p className="text-emerald-50/80 text-sm">POS จัดการรายการยา ค่ารักษา และออกใบเสร็จ</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Section: Login Form */}
            <div className="p-8 sm:p-12 flex flex-col justify-center">
              <div>
                {/* Mobile Logo */}
                <div className="lg:hidden flex items-center gap-3 mb-10">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-600">Clinic Management</p>
                    <p className="text-xl font-bold text-gray-900">ClinicSync</p>
                  </div>
                </div>

                <h2 className="text-3xl font-bold text-gray-900 mb-2">เข้าสู่ระบบ</h2>
                <p className="text-gray-500 mb-8">ใส่ข้อมูลเข้าสู่ระบบบริหารคลินิก</p>

                {/* Error Alert */}
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-start gap-3 animate-shake">
                    <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path>
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Email Input */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2.5">อีเมล</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-emerald-600 transition-colors">
                        <IconEmail />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@clinic.com"
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 focus:bg-white text-gray-900 placeholder:text-gray-400 transition-all text-sm font-medium outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2.5">รหัสผ่าน</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-emerald-600 transition-colors">
                        <IconLock />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 focus:bg-white text-gray-900 placeholder:text-gray-400 transition-all text-sm font-medium outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-emerald-600 transition-colors"
                      >
                        {showPassword ? <IconEyeOff /> : <IconEye />}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 border-gray-300 rounded-lg focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                    />
                    <label htmlFor="rememberMe" className="ml-2.5 text-sm text-gray-600 cursor-pointer font-medium">
                      จดจำการเข้าใช้งาน
                    </label>
                  </div>

                  {/* Login Button */}
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full mt-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:from-emerald-300 disabled:to-emerald-400 text-white font-bold rounded-xl shadow-lg shadow-emerald-200/50 hover:shadow-xl hover:shadow-emerald-300/50 transition-all active:scale-95 flex items-center justify-center gap-2 text-base"
                  >
                    {isLoggingIn ? (
                      <>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        กำลังเข้าสู่ระบบ...
                      </>
                    ) : (
                      'เข้าสู่ระบบ'
                    )}
                  </button>
                </form>

              </div>
            </div>

          </div>
        </div>


      </div>
    </div>
  )
}

export default LoginPage
