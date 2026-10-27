export interface AuthenticatedUser {
  id: string
  email?: string
  userMetadata?: Record<string, unknown>
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser
    }
  }
}

export {}
