import type { CookieOptions, Response } from 'express'

export const REFRESH_COOKIE = 'refresh_token'
export const CSRF_COOKIE = 'csrf_token'

/**
 * El refresh va en httpOnly porque es una credencial: con esto, un XSS no puede
 * leerlo. El CSRF va en una cookie normal a proposito, porque el patron de
 * doble envio consiste en que el cliente copie ese valor a una cabecera, y si
 * fuera httpOnly no podria.
 *
 * El Path es /auth y no /: el navegador solo envia estas cookies a las rutas de
 * autenticacion, asi que cada peticion del catalogo y del carrito arrastra dos
 * cookies menos.
 */
export const cookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/auth',
})

const csrfCookieOptions = (secure: boolean): CookieOptions => ({
  ...cookieOptions(secure),
  httpOnly: false,
})

export const setAuthCookies = (
  res: Response,
  refreshToken: string,
  csrfToken: string,
  refreshTtlMs: number,
  secure: boolean,
): void => {
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(secure), maxAge: refreshTtlMs })
  res.cookie(CSRF_COOKIE, csrfToken, { ...csrfCookieOptions(secure), maxAge: refreshTtlMs })
}

export const clearAuthCookies = (res: Response, secure: boolean): void => {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(secure))
  res.clearCookie(CSRF_COOKIE, csrfCookieOptions(secure))
}

export const readRefreshCookie = (cookies: unknown): string | null => {
  if (typeof cookies !== 'object' || cookies === null) {
    return null
  }

  const value = (cookies as Record<string, unknown>)[REFRESH_COOKIE]

  // Un array significa que hay dos cookies con el mismo nombre, y no hay forma
  // fiable de saber cual gano: en ese caso se trata como que no hay ninguna.
  return typeof value === 'string' && value.length > 0 ? value : null
}
