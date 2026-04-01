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

  const register = async (email, password, role) => {
    const result = await createUserWithEmailAndPassword(auth, email, password)
    const user = result.user
    const userDoc = doc(db, 'users', user.uid)

    await setDoc(userDoc, {
      email: user.email,
      role,
      createdAt: serverTimestamp()
    })

    setUserRole(role.toLowerCase())
    return result
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
    register
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
