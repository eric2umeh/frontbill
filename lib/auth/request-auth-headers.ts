/** Set by middleware after `getUser()`; read in Server Components to avoid a second Auth round-trip. */
export const AUTH_USER_ID_HEADER = 'x-auth-user-id'
export const AUTH_USER_EMAIL_HEADER = 'x-auth-user-email'
