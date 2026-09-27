import type { CookieOptions, Response } from 'express'

export const REFRESH_COOKIE = 'refresh_token'
export const CSRF_COOKIE = 'csrf_token'

/**
 * El refresh va en httpOnly porque es una credencial: con esto, un XSS no puede
 * leerlo. El CSRF va en una cookie normal a proposito, porque el patron de doble
 * envio consiste en que el cliente copie ese valor a una cabecera, y si fuera
 * httpOnly no podria.
 *
 * El Path del refresh es `/api/auth` y no `/`: la API vive bajo el prefijo
 * `/api`, asi que sus rutas son `/api/auth/refresh` y `/api/auth/logout`. Con el
 * path en `/auth` el navegador no encontraba las rutas, no enviaba la cookie, y
 * la sesion se cerraba sola al recargar. Limitarla sigue valiendo la pena: cada
 * peticion del catalogo y del carrito deja de arrastrar una credencial.
 */
export const cookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/api/auth',
})

/**
 * El CSRF necesita un path distinto al del refresh, y no es un capricho: el
 * navegador solo expone a `document.cookie` las cookies cuyo path coincide con
 * el de la pagina que se esta mirando. La pagina de la tienda esta en `/`, asi
 * que una cookie con path `/api/auth` no se ve desde el JavaScript y el doble
 * envio no se puede montar.
 *
 * Aqui el path es `/` a proposito. Perder el ahorro de no mandar la cookie en
 * cada peticion es lo que permite que la proteccion exista; y no es una
 * credencial, asi que leerla no da acceso a nada por si solo.
 */
export const csrfCookieOptions = (secure: boolean): CookieOptions => ({
  httpOnly: false,
  secure,
  sameSite: 'lax',
  path: '/',
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
