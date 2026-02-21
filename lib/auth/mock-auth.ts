'use client'

// Mock authentication system for development without Supabase
export interface MockUser {
  id: string
  email: string
  role: 'admin' | 'manager' | 'front_desk' | 'accountant'
  full_name: string
}

const MOCK_USERS = [
  { id: '1', email: 'admin@frontbill.com', password: 'Admin@123456', role: 'admin' as const, full_name: 'Admin User' },
  { id: '2', email: 'manager@frontbill.com', password: 'Manager@123', role: 'manager' as const, full_name: 'Manager User' },
  { id: '3', email: 'desk@frontbill.com', password: 'Desk@123', role: 'front_desk' as const, full_name: 'Front Desk User' },
  { id: '4', email: 'accountant@frontbill.com', password: 'Account@123', role: 'accountant' as const, full_name: 'Accountant User' },
]

const AUTH_STORAGE_KEY = 'frontbill_mock_auth'

export const mockAuth = {
  async signIn(email: string, password: string): Promise<{ user: MockUser | null; error: string | null }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const user = MOCK_USERS.find(u => u.email === email && u.password === password)
    
    if (user) {
      const { password: _, ...userWithoutPassword } = user
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userWithoutPassword))
      return { user: userWithoutPassword, error: null }
    }
    
    return { user: null, error: 'Invalid email or password' }
  },

  async signOut(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500))
    localStorage.removeItem(AUTH_STORAGE_KEY)
  },

  getUser(): MockUser | null {
    if (typeof window === 'undefined') return null
    
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) return null
    
    try {
      return JSON.parse(stored)
    } catch {
      return null
    }
  },

  isAuthenticated(): boolean {
    return this.getUser() !== null
  }
}
