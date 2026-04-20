export type UserRole = 'coordinator' | 'member'

export interface User {
  id: string
  role: UserRole
  name: string
  dob: string
  cpf: string
  rg: string
  origin_street: string
  origin_neighborhood: string
  origin_zip: string
  destination_street: string
  destination_neighborhood: string
  destination_zip: string
}

export interface Category {
  id: string
  name: string
  days_of_week: string[]
  start_time: string
  end_time: string
  location: string
  observations?: string
  price_drop_in: number
  price_weekly: number
  price_monthly: number
  price_semiannual: number
  price_annual: number
}

export interface Position {
  id: string
  name: string
}

export interface UserCategory {
  user_id: string
  category_id: string
  position_id: string
  is_monthly_payer: boolean
}

export interface Training {
  id: string
  category_id: string
  date: string
  status: 'scheduled' | 'done' | 'cancelled'
}

export interface Attendance {
  id: string
  training_id: string
  user_id: string
  status: 'present' | 'absent'
}

export interface Financial {
  id: string
  user_id: string
  category_id: string
  month: number
  year: number
  status: 'paid' | 'pending' | 'refunded'
}
