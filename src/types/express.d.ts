export interface AuthenticatedUser {
  id: string
  email?: string
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser
    }
  }
}

export {}
