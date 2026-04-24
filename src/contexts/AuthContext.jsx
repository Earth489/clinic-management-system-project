import { createContext, useContext, useEffect, useState } from 'react'
import { auth, db } from '../firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)

  const register = async (email, password, role, firstName = '', lastName = '') => {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    const user = result.user
    const userDoc = doc(db, 'users', user.uid)

    const userData = {
      email: user.email,
      role,
      createdAt: serverTimestamp()
    }

    // Add name fields for doctor role
    if (role.toLowerCase() === 'doctor') {
      userData.firstName = firstName
      userData.lastName = lastName
    }

    await setDoc(userDoc, userData)

    setUserRole(role.toLowerCase())
    return result
  }

  // Admin function to create user without signing in
  const createUser = async (email, password, role, firstName = '', lastName = '') => {
    try {
      const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
      if (!apiKey) {
        throw new Error('Firebase API key is not configured')
      }

      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: false
          })
        }
      )

      const data = await response.json()
      if (!response.ok) {
        const errorMessage = data.error?.message || 'ไม่สามารถสร้างผู้ใช้ใหม่ได้'
        throw new Error(errorMessage)
      }

      const uid = data.localId
      if (!uid) {
        throw new Error('ไม่พบ UID ของผู้ใช้ที่สร้าง')
      }

      const userDoc = doc(db, 'users', uid)
      const userData = {
        email,
        role,
        createdAt: serverTimestamp()
      }

      if (role.toLowerCase() === 'doctor') {
        userData.firstName = firstName
        userData.lastName = lastName
      }

      await setDoc(userDoc, userData)
      return { uid, email, role }
    } catch (error) {
      throw error
    }
  }

  const login = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password)
    return result
  }

  const logout = async () => {
    setCurrentUser(null)
    setUserRole('')
    // Clear any remaining session data
    sessionStorage.clear()
    localStorage.removeItem('auth_token')
    await signOut(auth)
  }

  const fetchUserRole = async (uid) => {
    if (!uid) {
      setUserRole('')
      return
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', uid))
      console.log('[AuthContext] Fetching Firestore document for UID:', uid)
      
      if (userDoc.exists()) {
        const data = userDoc.data() || {}
        const role = data.role ? data.role.toLowerCase().trim() : null
        setUserRole(role)
      } else {
        console.error('[AuthContext] No document found in Firestore "users" collection for UID:', uid)
        setUserRole(null)
      }
    } catch (error) {
      console.error('Firestore fetch error:', error)
      setUserRole(null)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (user) {
        await fetchUserRole(user.uid)
      } else {
        setUserRole('')
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const value = {
    currentUser,
    userRole,
    loading,
    login,
    logout,
    register,
    createUser
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
