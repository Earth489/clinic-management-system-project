import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../firebase'
import AdminHeader from '../components/AdminHeader'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where
} from 'firebase/firestore'

// ──────────────────────────────────────────────
// Icons (inline SVG helpers)
// ──────────────────────────────────────────────
const IconPlus = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
)
const IconEdit = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
  </svg>
)
const IconTrash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
)
const IconSearch = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
  </svg>
)
const IconClose = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
)

// ──────────────────────────────────────────────
// Empty form values
// ──────────────────────────────────────────────
const emptyForm = {
  email: '',
  password: '',
  confirmPassword: '',
  role: 'staff',
  firstName: '',
  lastName: ''
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────
function AdminUserManagement() {
  const { currentUser, userRole, logout, createUser } = useAuth()
  const navigate = useNavigate()

  // Data
  const [users, setUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  // UI state
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [logoutMsg, setLogoutMsg] = useState('')

  // ── Real-time listeners ──────────────────────
  useEffect(() => {
    // First try to get all users to see if data exists
    const allUsersQ = query(collection(db, 'users'))
    const unsubscribe = onSnapshot(allUsersQ, (snapshot) => {
      console.log('All users snapshot:', snapshot.docs.length, 'documents')
      const allUsers = snapshot.docs.map((d) => {
        console.log('All user data:', d.id, d.data())
        return { id: d.id, ...d.data() }
      })

      // Filter out current admin user for security (don't show current admin in list)
      const filteredUsers = allUsers.filter(user => user.id !== currentUser?.uid)
      console.log('Filtered users for display:', filteredUsers.length, 'documents')

      // Sort by createdAt
      filteredUsers.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0
        return b.createdAt.seconds - a.createdAt.seconds
      })

      setUsers(filteredUsers)
    }, (error) => {
      console.error('Error fetching all users:', error)
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้: ' + error.message)
    })
    return () => unsubscribe()
  }, [currentUser])

  // ── Auto-hide success message ───────────────
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000)
      return () => clearTimeout(t)
    }
  }, [successMsg])

  // ── Helpers ─────────────────────────────────
  const handleLogout = async () => {
    try {
      setLogoutMsg('กำลังออกจากระบบ...')
      await logout()
      setLogoutMsg('ออกจากระบบสำเร็จ')
      setTimeout(() => {
        navigate('/')
      }, 800)
    } catch (error) {
      console.error('Logout error:', error)
      alert('เกิดข้อผิดพลาด: ' + error.message)
      setLogoutMsg('')
    }
  }

  const openAddModal = () => {
    setFormData(emptyForm)
    setIsEditing(false)
    setEditingId(null)
    setShowModal(true)
  }

  const openEditModal = (user) => {
    setFormData({
      email: user.email || '',
      password: '',
      confirmPassword: '',
      role: user.role || 'staff',
      firstName: user.firstName || '',
      lastName: user.lastName || ''
    })
    setIsEditing(true)
    setEditingId(user.id)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setFormData(emptyForm)
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  // ── Create new user ──────────────────────────
  const handleCreateUser = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      if (formData.password !== formData.confirmPassword) {
        alert('รหัสผ่านไม่ตรงกัน')
        setSaving(false)
        return
      }

      if (formData.password.length < 6) {
        alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
        setSaving(false)
        return
      }

      // Create user using AuthContext createUser function
      await createUser(
        formData.email,
        formData.password,
        formData.role,
        formData.role === 'doctor' ? formData.firstName : '',
        formData.role === 'doctor' ? formData.lastName : ''
      )

      setSuccessMsg('เพิ่มผู้ใช้สำเร็จ')
      closeModal()
    } catch (err) {
      console.error('Create user error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Update user ──────────────────────────────
  const handleUpdateUser = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const updateData = {
        role: formData.role,
        updatedAt: serverTimestamp()
      }

      if (formData.role === 'doctor') {
        updateData.firstName = formData.firstName
        updateData.lastName = formData.lastName
      } else {
        // Remove name fields for non-doctor roles
        updateData.firstName = ''
        updateData.lastName = ''
      }

      await updateDoc(doc(db, 'users', editingId), updateData)
      setSuccessMsg('อัปเดตผู้ใช้สำเร็จ')
      closeModal()
    } catch (err) {
      console.error('Update user error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete user ──────────────────────────────
  const handleDelete = async (id) => {
    try {
      // Note: Deleting users from Firebase Auth requires admin SDK
      // For now, we'll just mark them as inactive or remove from Firestore
      await deleteDoc(doc(db, 'users', id))
      setDeleteConfirm(null)
      setSuccessMsg('ลบผู้ใช้สำเร็จ')
    } catch (err) {
      console.error('Delete user error:', err)
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // ── Filter ──────────────────────────────────
  const filtered = users.filter((user) => {
    const term = searchTerm.toLowerCase()
    const fullName = user.role === 'doctor' ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : ''
    return (
      (user.email || '').toLowerCase().includes(term) ||
      (user.role || '').toLowerCase().includes(term) ||
      fullName.toLowerCase().includes(term)
    )
  })

  // ── Role badge ───────────────────────────────
  const getRoleBadge = (role) => {
    const roleMap = {
      admin: { color: 'bg-purple-100 text-purple-700', label: 'ผู้ดูแลระบบ' },
      staff: { color: 'bg-blue-100 text-blue-700', label: 'เจ้าหน้าที่' },
      doctor: { color: 'bg-green-100 text-green-700', label: 'แพทย์' }
    }
    const { color, label } = roleMap[role] || { color: 'bg-gray-100 text-gray-700', label: role || 'ไม่ระบุ' }
    return <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${color}`}>{label}</span>
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <AdminHeader currentUser={currentUser} userRole={userRole} onLogout={handleLogout}>
      {/* ── Logout notification toast ─── */}
      {logoutMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-teal-500/20 border border-teal-500/50 text-teal-100 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {logoutMsg}
        </div>
      )}

      {/* ── Success toast ─────────────────── */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 px-5 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium animate-[fadeIn_0.3s_ease]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* ── Search + Stats ───────────────── */}
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">จัดการผู้ใช้ (Admin)</h1>
          <p className="text-gray-500 mt-1">จัดการข้อมูลผู้ใช้ทั้งหมดในระบบ</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <IconSearch />
            </div>
            <input
              type="text"
              placeholder="ค้นหาอีเมล, ตำแหน่ง, ชื่อ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
            />
          </div>

          {/* Stat badge + Add button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="inline-flex items-center justify-center h-7 min-w-[28px] px-2 rounded-full bg-teal-100 text-teal-700 font-bold text-xs">
                {filtered.length}
              </span>
              ผู้ใช้
            </div>
            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl hover:bg-teal-700 active:scale-[0.97] transition-all font-semibold text-sm shadow-sm shadow-teal-200"
            >
              <IconPlus />
              เพิ่มผู้ใช้
            </button>
          </div>
        </div>

        {/* ── Table ─────────────────────── */}
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th className="px-4 py-3 font-semibold whitespace-nowrap">อีเมล</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">ตำแหน่ง</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">ชื่อ</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">วันที่สร้าง</th>
                <th className="px-4 py-3 font-semibold text-center whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      {searchTerm ? 'ไม่พบข้อมูลที่ตรงกับการค้นหา' : 'ยังไม่มีผู้ใช้'}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-teal-50/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-teal-700 whitespace-nowrap">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getRoleBadge(user.role)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {user.role === 'doctor' ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || '-' : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('th-TH') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {user.role === 'admin' ? (
                          <span className="text-xs text-gray-400 italic">ไม่สามารถแก้ไข</span>
                        ) : (
                          <>
                            <button
                              onClick={() => openEditModal(user)}
                              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                              title="แก้ไข"
                            >
                              <IconEdit />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(user.id)}
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                              title="ลบ"
                            >
                              <IconTrash />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════════════════════════════════════
          Modal: Add / Edit User
         ════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Dialog */}
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden animate-[scaleIn_0.2s_ease]">
            {/* Title bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-white">
              <h2 className="text-lg font-bold text-gray-900">
                {isEditing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <IconClose />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={isEditing ? handleUpdateUser : handleCreateUser} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  อีเมล <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={isEditing}
                  placeholder="user@example.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm disabled:bg-gray-100"
                />
              </div>

              {/* Password (only for new users) */}
              {!isEditing && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      รหัสผ่าน <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      minLength={6}
                      placeholder="อย่างน้อย 6 ตัวอักษร"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                      placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                    />
                  </div>
                </>
              )}

              {/* Role */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  ตำแหน่ง <span className="text-red-500">*</span>
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                >
                  <option value="staff">เจ้าหน้าที่</option>
                  <option value="doctor">แพทย์</option>
                </select>
              </div>

              {/* Name fields for doctor */}
              {formData.role === 'doctor' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      ชื่อ <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      required
                      placeholder="ชื่อจริง"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      นามสกุล <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      required
                      placeholder="นามสกุล"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-400 transition-all text-sm"
                    />
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 active:scale-[0.97] transition-all shadow-sm shadow-teal-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving
                    ? 'กำลังบันทึก...'
                    : isEditing
                    ? 'อัปเดต'
                    : 'สร้างผู้ใช้'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          Modal: Delete Confirmation
         ════════════════════════════════════════ */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          />

          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <IconTrash />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">ยืนยันการลบ</h3>
              <p className="text-gray-500 text-sm mb-6">
                คุณต้องการลบผู้ใช้นี้หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors"
                >
                  ลบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminHeader>
  )
}

export default AdminUserManagement